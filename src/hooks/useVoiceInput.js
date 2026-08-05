import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RECORDING_MS = 2 * 60 * 1000;
const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

function supportedRecorderType() {
    if (typeof MediaRecorder === 'undefined') return '';
    return RECORDER_TYPES.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the voice recording.'));
        reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
        reader.readAsDataURL(blob);
    });
}

function cleanIpcError(error) {
    const message = error instanceof Error ? error.message : String(error || 'Voice transcription failed.');
    return message.replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

export function useVoiceInput(value, onChange, disabled = false) {
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [permissionBlocked, setPermissionBlocked] = useState(false);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const mountedRef = useRef(true);
    const runIdRef = useRef(0);
    const valueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    valueRef.current = value;
    onChangeRef.current = onChange;

    const supported = typeof window !== 'undefined'
        && typeof navigator !== 'undefined'
        && Boolean(navigator.mediaDevices?.getUserMedia)
        && typeof MediaRecorder !== 'undefined'
        && typeof window.electron?.transcribeVoice === 'function';

    const releaseStream = useCallback(() => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }, []);

    const cancel = useCallback(() => {
        runIdRef.current += 1;
        window.clearTimeout(timerRef.current);
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.onstop = null;
            recorder.stop();
        }
        recorderRef.current = null;
        chunksRef.current = [];
        releaseStream();
        if (mountedRef.current) setStatus('idle');
    }, [releaseStream]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cancel();
        };
    }, [cancel]);

    useEffect(() => {
        if (disabled) cancel();
    }, [cancel, disabled]);

    const stop = useCallback(() => {
        window.clearTimeout(timerRef.current);
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, []);

    const start = useCallback(async () => {
        if (disabled || !supported || status !== 'idle') return;
        if (permissionBlocked) {
            await window.electron.openMicrophoneSettings?.();
            setPermissionBlocked(false);
            setError('Grant microphone access to Perci, then try again.');
            return;
        }

        setError('');
        setStatus('requesting');
        const runId = runIdRef.current + 1;
        runIdRef.current = runId;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
            });
            if (runId !== runIdRef.current) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = stream;
            const mimeType = supportedRecorderType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            chunksRef.current = [];
            recorderRef.current = recorder;

            recorder.ondataavailable = event => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onerror = () => {
                recorder.onstop = null;
                recorderRef.current = null;
                if (mountedRef.current && runId === runIdRef.current) {
                    setError('The microphone recording stopped unexpectedly.');
                    setStatus('idle');
                }
                releaseStream();
            };
            recorder.onstop = async () => {
                window.clearTimeout(timerRef.current);
                recorderRef.current = null;
                releaseStream();
                if (!mountedRef.current || runId !== runIdRef.current) return;
                setStatus('transcribing');
                try {
                    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
                    const audioBase64 = await blobToBase64(blob);
                    const result = await window.electron.transcribeVoice({
                        audioBase64,
                        mimeType: blob.type,
                    });
                    const transcript = String(result?.text || '').trim();
                    if (!transcript) throw new Error('The transcription service returned no text.');
                    if (!mountedRef.current || runId !== runIdRef.current) return;
                    const current = String(valueRef.current || '');
                    onChangeRef.current(`${current}${current && !/\s$/.test(current) ? ' ' : ''}${transcript}`);
                    setError('');
                } catch (transcriptionError) {
                    if (mountedRef.current && runId === runIdRef.current) {
                        setError(cleanIpcError(transcriptionError));
                    }
                } finally {
                    if (mountedRef.current && runId === runIdRef.current) setStatus('idle');
                }
            };

            recorder.start(1000);
            setStatus('recording');
            timerRef.current = window.setTimeout(stop, MAX_RECORDING_MS);
        } catch (microphoneError) {
            if (runId !== runIdRef.current) return;
            const blocked = microphoneError?.name === 'NotAllowedError' || microphoneError?.name === 'SecurityError';
            setPermissionBlocked(blocked);
            setError(blocked
                ? 'Microphone access is blocked. Click again to open microphone settings.'
                : 'No usable microphone is available.');
            releaseStream();
            setStatus('idle');
        }
    }, [disabled, permissionBlocked, releaseStream, status, stop, supported]);

    const toggle = status === 'recording' ? stop : start;
    return { cancel, error, status, supported, toggle };
}
