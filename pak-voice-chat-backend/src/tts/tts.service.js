const axios = require("axios");

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

async function generateSpeechBuffer(text, lang) {
  console.log("[TTS VERSION] DIRECT ELEVENLABS API - NO SDK - NO FFMPEG");

  const cleanText = normalizeTextForTTS(text);
  if (!cleanText) throw new Error("Empty text passed to TTS");

  const voiceId = getVoiceIdByLanguage(lang);
  if (!voiceId) throw new Error(`No voice configured for ${lang}`);

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await axios.post(
    url,
    {
      text: cleanText,
      model_id: modelId,
      voice_settings: {
        stability: 0.72,
        similarity_boost: 0.85,
        style: 0.02,
        use_speaker_boost: true,
      },
    },
    {
      responseType: "arraybuffer",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
    }
  );

  return Buffer.from(response.data);
}

module.exports = {
  generateSpeechBuffer,
  getVoiceIdByLanguage,
};