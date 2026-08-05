import { describe, expect, it } from 'vitest';
import voiceTranscription from '../electron/voice-transcription.cjs';

const {
    MAX_VOICE_AUDIO_BYTES,
    decodeVoiceAudio,
    prepareVoiceTranscription,
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
        )).toMatchObject({ providerId: 'openai', extension: 'm4a' });
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
});
