const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const Groq = require("groq-sdk");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path; // ✅ CHANGE: ffmpeg-path import add karo

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ✅ CHANGE: mapLanguage updated with proper language codes
function mapLanguage(langHint) {
  const map = {
    en: "en",
    ur: "ur",
    sd: "sd",
    ps: "ps",
    bal: "ur",
    hinglish: "hi",
    de: "de",
    es: "es",
    zh: "zh",
  };
  return map[langHint] || undefined;
}

function normalizeAudio(inputPath) {
  return new Promise((resolve) => {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, "_clean.wav");

    // ✅ CHANGE: ffmpeg ki jagah ffmpegPath use karo
    const command = `"${ffmpegPath}" -y -i "${inputPath}" -ac 1 -ar 16000 -af "highpass=f=120,lowpass=f=7600,volume=1.8" "${outputPath}"`;

    exec(command, (error) => {
      if (error) {
        console.warn("[STT] ffmpeg normalize failed, using original audio:", error.message);
        return resolve(inputPath);
      }
      resolve(outputPath);
    });
  });
}

async function transcribeAudio(filePath, langHint) {
  let cleanedPath = filePath;

  try {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    cleanedPath = await normalizeAudio(filePath);
    const language = mapLanguage(langHint);

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(cleanedPath),
      model: "whisper-large-v3",
      ...(language ? { language } : {}),
      prompt:
        "Transcribe exactly what is spoken. Keep names, mixed Urdu-English words, and spoken phrasing. Do not rewrite, summarize, translate, beautify, or correct grammar.",
      response_format: "json",
      temperature: 0
    });

    const text = transcription?.text?.trim() || "";
    if (!text) throw new Error("Empty transcription returned from STT");

    return text;
  } catch (error) {
    console.error("Groq STT Error:", error.response?.data || error.message);
    throw error;
  } finally {
    if (
      cleanedPath &&
      cleanedPath !== filePath &&
      fs.existsSync(cleanedPath)
    ) {
      try {
        fs.unlinkSync(cleanedPath);
      } catch (err) {
        console.warn("[STT] cleanup failed:", err.message);
      }
    }
  }
}

module.exports = { transcribeAudio };