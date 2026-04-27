const axios = require("axios");
const cloudinary = require("../utils/cloudinary");

function getVoiceIdByLanguage(lang) {
  const map = {
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
  return map[lang] || process.env.ELEVENLABS_VOICE_EN;
}

function uploadAudioBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "alfa-translated-voice",
        format: "mp3",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    stream.end(buffer);
  });
}

async function generateTranslatedVoiceUrl(text, lang) {
  console.log("[TTS DIRECT] No ffmpeg, no local file");

  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Empty TTS text");

  const voiceId = getVoiceIdByLanguage(lang);
  if (!voiceId) throw new Error(`No voice configured for ${lang}`);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: cleanText,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
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

  return uploadAudioBuffer(Buffer.from(response.data));
}

module.exports = { generateTranslatedVoiceUrl };