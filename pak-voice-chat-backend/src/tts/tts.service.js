const { ElevenLabsClient } = require("elevenlabs");
const fs = require("fs");
const path = require("path");
const os = require("os");

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

console.log("[TTS] ELEVENLABS_API_KEY loaded:", !!process.env.ELEVENLABS_API_KEY);
console.log("[TTS] ELEVENLABS_MODEL_ID:", process.env.ELEVENLABS_MODEL_ID);
console.log("[TTS] ELEVENLABS_VOICE_EN:", process.env.ELEVENLABS_VOICE_EN);
console.log("[TTS] ELEVENLABS_VOICE_UR:", process.env.ELEVENLABS_VOICE_UR);
console.log("[TTS] ELEVENLABS_VOICE_SD:", process.env.ELEVENLABS_VOICE_SD);

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
    sd:
      process.env.ELEVENLABS_VOICE_SD ||
      process.env.ELEVENLABS_VOICE_UR ||
      process.env.ELEVENLABS_VOICE_EN,
    ps:
      process.env.ELEVENLABS_VOICE_PS ||
      process.env.ELEVENLABS_VOICE_UR ||
      process.env.ELEVENLABS_VOICE_EN,
    bal:
      process.env.ELEVENLABS_VOICE_BAL ||
      process.env.ELEVENLABS_VOICE_UR ||
      process.env.ELEVENLABS_VOICE_EN,
    de:
      process.env.ELEVENLABS_VOICE_DE ||
      process.env.ELEVENLABS_VOICE_EN,
    hinglish:
      process.env.ELEVENLABS_VOICE_HINGLISH ||
      process.env.ELEVENLABS_VOICE_EN,
    es:
      process.env.ELEVENLABS_VOICE_ES ||
      process.env.ELEVENLABS_VOICE_EN,
    zh:
      process.env.ELEVENLABS_VOICE_ZH ||
      process.env.ELEVENLABS_VOICE_EN,
  };

  return voiceMap[lang] || process.env.ELEVENLABS_VOICE_EN;
}


async function streamToBuffer(audioStream) {
  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function generateSpeech(text, lang) {
  console.log("[TTS VERSION] NO FFMPEG TTS SERVICE ACTIVE");
  try {
    const cleanText = normalizeTextForTTS(text);

    if (!cleanText) {
      throw new Error("Empty text passed to TTS");
    }

    const voiceId = getVoiceIdByLanguage(lang);

    if (!voiceId) {
      throw new Error("No ElevenLabs voice ID configured");
    }

    const modelId =
      process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

    const tempDir = path.join(os.tmpdir(), "alfa-tts");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filename = `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`;
    const outputPath = path.join(tempDir, filename);

    console.log("[TTS] Generating speech with:", {
      lang,
      voiceId,
      modelId,
      textLength: cleanText.length,
    });

    const audioStream = await client.generate({
      voice: voiceId,
      model_id: modelId,
      text: cleanText,
      voice_settings: {
        stability: 0.78,
        similarity_boost: 0.88,
        style: 0.02,
        speed: 0.96,
        use_speaker_boost: true,
      },
    });

    const finalBuffer = await streamToBuffer(audioStream);

    if (!finalBuffer.length) {
      throw new Error("Empty audio buffer returned from ElevenLabs");
    }

    // ✅ CHANGE: Sirf file save karo, normalize mat karo
    fs.writeFileSync(outputPath, finalBuffer);

    // ✅ CHANGE: Direct outputPath return karo
    return outputPath;
  } catch (error) {
    console.error("ElevenLabs Error full:", error);
    console.error("ElevenLabs Error message:", error?.message || error);
    console.error("ElevenLabs Error statusCode:", error?.statusCode || null);
    console.error("ElevenLabs Error body:", error?.body || null);
    throw error;
  }
}

module.exports = { generateSpeech, getVoiceIdByLanguage };