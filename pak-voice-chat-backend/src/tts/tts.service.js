const { ElevenLabsClient } = require("elevenlabs");

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

function normalizeTextForTTS(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\n+/g, " ")
    .trim();
}

function getVoiceIdByLanguage(lang) {
  const voiceMap = {
    en: process.env.ELEVENLABS_VOICE_EN,
    ur: process.env.ELEVENLABS_VOICE_UR || process.env.ELEVENLABS_VOICE_EN,
    sd: process.env.ELEVENLABS_VOICE_SD || process.env.ELEVENLABS_VOICE_UR || process.env.ELEVENLABS_VOICE_EN,
    ps: process.env.ELEVENLABS_VOICE_PS || process.env.ELEVENLABS_VOICE_UR || process.env.ELEVENLABS_VOICE_EN,
    bal: process.env.ELEVENLABS_VOICE_BAL || process.env.ELEVENLABS_VOICE_UR || process.env.ELEVENLABS_VOICE_EN,
    de: process.env.ELEVENLABS_VOICE_DE || process.env.ELEVENLABS_VOICE_EN,
    hinglish: process.env.ELEVENLABS_VOICE_HINGLISH || process.env.ELEVENLABS_VOICE_UR || process.env.ELEVENLABS_VOICE_EN,
    es: process.env.ELEVENLABS_VOICE_ES || process.env.ELEVENLABS_VOICE_EN,
    zh: process.env.ELEVENLABS_VOICE_ZH || process.env.ELEVENLABS_VOICE_EN,
  };

  return voiceMap[lang] || process.env.ELEVENLABS_VOICE_EN;
}

async function streamToBuffer(audioStream) {
  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function generateSpeechBuffer(text, lang) {
  console.log("[TTS VERSION] BUFFER ONLY - NO FFMPEG - NO LOCAL FILE");

  const cleanText = normalizeTextForTTS(text);
  if (!cleanText) throw new Error("Empty text passed to TTS");

  const voiceId = getVoiceIdByLanguage(lang);
  if (!voiceId) throw new Error(`No ElevenLabs voice ID configured for ${lang}`);

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const audioStream = await client.generate({
    voice: voiceId,
    model_id: modelId,
    text: cleanText,
    voice_settings: {
      stability: 0.72,
      similarity_boost: 0.85,
      style: 0.02,
      speed: 0.96,
      use_speaker_boost: true,
    },
  });

  const audioBuffer = await streamToBuffer(audioStream);
  if (!audioBuffer.length) throw new Error("Empty audio buffer returned from ElevenLabs");

  return audioBuffer;
}

module.exports = {
  generateSpeechBuffer,
  getVoiceIdByLanguage,
};