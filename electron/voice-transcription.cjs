const MAX_VOICE_AUDIO_BYTES = 20 * 1024 * 1024;

const AUDIO_TYPES = new Map([
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/ogg', 'ogg'],
]);

function selectVoiceProvider(keys = {}) {
  if (typeof keys.groq === 'string' && keys.groq.trim()) {
    return {
      endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
      key: keys.groq.trim(),
      model: 'whisper-large-v3',
      providerId: 'groq',
    };
  }
  if (typeof keys.openai === 'string' && keys.openai.trim()) {
    return {
      endpoint: 'https://api.openai.com/v1/audio/transcriptions',
      key: keys.openai.trim(),
      model: 'whisper-1',
      providerId: 'openai',
    };
  }
  throw new Error('Add a Groq or OpenAI API key in Settings to use voice dictation.');
}

function decodeVoiceAudio(payload = {}) {
  const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64 : '';
  const mimeType = typeof payload.mimeType === 'string'
    ? payload.mimeType.toLowerCase().split(';', 1)[0].trim()
    : '';
  const extension = AUDIO_TYPES.get(mimeType);

  if (!extension) throw new Error('Unsupported voice recording format.');
  if (!audioBase64 || audioBase64.length > Math.ceil(MAX_VOICE_AUDIO_BYTES / 3) * 4 + 4) {
    throw new Error('Voice recording is empty or too large.');
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audioBase64)) {
    throw new Error('Voice recording data is invalid.');
  }

  const buffer = Buffer.from(audioBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_VOICE_AUDIO_BYTES) {
    throw new Error('Voice recording is empty or too large.');
  }

  return { buffer, extension, mimeType };
}

function prepareVoiceTranscription(payload, keys) {
  return {
    ...selectVoiceProvider(keys),
    ...decodeVoiceAudio(payload),
  };
}

module.exports = {
  MAX_VOICE_AUDIO_BYTES,
  decodeVoiceAudio,
  prepareVoiceTranscription,
  selectVoiceProvider,
};
