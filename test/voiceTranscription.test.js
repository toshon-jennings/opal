import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import voiceTranscription from '../electron/voice-transcription.cjs';

const {
    MAX_VOICE_AUDIO_BYTES,
    MAX_VOICE_RESPONSE_BYTES,
    decodeVoiceAudio,
    listVoiceProviders,
    prepareVoiceTranscription,
    readBoundedResponseText,
    selectVoiceProvider,
} = voiceTranscription;

describe('voice transcription boundary', () => {
    it('prefers Groq and falls back to OpenAI', () => {
        expect(selectVoiceProvider({ groq: ' gsk_test ', openai: 'sk_test' })).toMatchObject({
            providerId: 'groq',
            key: 'gsk_test',
            model: 'whisper-large-v3',
        });
        expect(selectVoiceProvider({ openai: ' sk_test ' })).toMatchObject({
            providerId: 'openai',
            key: 'sk_test',
            model: 'whisper-1',
        });
        expect(() => selectVoiceProvider({})).toThrow('Add a Groq or OpenAI API key');
        expect(listVoiceProviders({ groq: 'gsk_test', openai: 'sk_test' }).map(provider => provider.providerId))
            .toEqual(['groq', 'openai']);
    });

    it('accepts supported recorder output and strips codec parameters', () => {
        const audioBase64 = Buffer.from('recording').toString('base64');
        expect(decodeVoiceAudio({ audioBase64, mimeType: 'audio/webm;codecs=opus' })).toMatchObject({
            extension: 'webm',
            mimeType: 'audio/webm',
        });
        expect(prepareVoiceTranscription(
            { audioBase64, mimeType: 'audio/mp4' },
            { openai: 'sk_test' },
        )).toMatchObject({ extension: 'm4a', providers: [{ providerId: 'openai' }] });
    });

    it('rejects malformed, unsupported, empty, and oversized input', () => {
        expect(() => decodeVoiceAudio({ audioBase64: 'not base64', mimeType: 'audio/webm' }))
            .toThrow('invalid');
        expect(() => decodeVoiceAudio({ audioBase64: 'YQ==', mimeType: 'text/plain' }))
            .toThrow('Unsupported');
        expect(() => decodeVoiceAudio({ audioBase64: '', mimeType: 'audio/webm' }))
            .toThrow('empty or too large');
        expect(() => decodeVoiceAudio({
            audioBase64: 'A'.repeat(Math.ceil(MAX_VOICE_AUDIO_BYTES / 3) * 4 + 8),
            mimeType: 'audio/webm',
        })).toThrow('empty or too large');
    });

    it('keeps dictation draft-only and makes its control non-submitting', () => {
        const root = path.resolve(import.meta.dirname, '..');
        const hookSource = fs.readFileSync(path.join(root, 'src/hooks/useVoiceInput.js'), 'utf8');
        const buttonSource = fs.readFileSync(path.join(root, 'src/components/VoiceInputButton.jsx'), 'utf8');

        expect(buttonSource).toContain('type="button"');
        expect(hookSource).not.toMatch(/requestSubmit|\.submit\(|dispatchEvent/);
        expect(hookSource).toContain('onChangeRef.current');
    });

    it('wires dictation into the native Hermes and OpenClaw composers', () => {
        const root = path.resolve(import.meta.dirname, '..');
        const hermesSource = fs.readFileSync(path.join(root, 'src/components/ChatTab.jsx'), 'utf8');
        const openClawSource = fs.readFileSync(path.join(root, 'src/components/OpenClawChatPanel.jsx'), 'utf8');

        expect(hermesSource).toContain('<VoiceInputButton value={text} onChange={setText}');
        expect(openClawSource).toContain('<VoiceInputButton value={text} onChange={setText}');
    });

    it('bounds transcription API responses', async () => {
        await expect(readBoundedResponseText(new Response('{"text":"hello"}')))
            .resolves.toBe('{"text":"hello"}');
        await expect(readBoundedResponseText(new Response('x'.repeat(MAX_VOICE_RESPONSE_BYTES + 1))))
            .rejects.toThrow('too much data');
    });
});
