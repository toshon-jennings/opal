const MAX_VOICE_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_VOICE_RESPONSE_BYTES = 256 * 1024;

const AUDIO_TYPES = new Map([
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/ogg', 'ogg'],
]);

function listVoiceProviders(keys = {}) {
  const providers = [];
  if (typeof keys.groq === 'string' && keys.groq.trim()) {
    providers.push({
      endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
      key: keys.groq.trim(),
      model: 'whisper-large-v3',
      providerId: 'groq',
    });
  }
  if (typeof keys.openai === 'string' && keys.openai.trim()) {
    providers.push({
      endpoint: 'https://api.openai.com/v1/audio/transcriptions',
      key: keys.openai.trim(),
      model: 'whisper-1',
      providerId: 'openai',
    });
  }
  if (providers.length === 0) {
    throw new Error('Add a Groq or OpenAI API key in Settings to use voice dictation.');
  }
  return providers;
}

function selectVoiceProvider(keys = {}) {
  return listVoiceProviders(keys)[0];
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
    ...decodeVoiceAudio(payload),
    providers: listVoiceProviders(keys),
  };
}

async function readBoundedResponseText(response, maxBytes = MAX_VOICE_RESPONSE_BYTES) {
  const contentLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('The transcription service returned too much data.');
  }
  const reader = response?.body?.getReader?.();
  if (!reader) throw new Error('The transcription service returned an unreadable response.');

  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error('The transcription service returned too much data.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

module.exports = {
  MAX_VOICE_AUDIO_BYTES,
  MAX_VOICE_RESPONSE_BYTES,
  decodeVoiceAudio,
  listVoiceProviders,
  prepareVoiceTranscription,
  readBoundedResponseText,
  selectVoiceProvider,
};
