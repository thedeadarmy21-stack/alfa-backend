const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function mapLanguage(langHint) {
  const map = {
    en: "en",
    ur: "ur",
    hi: "hi",
    sd: "ur",
    ps: "ur",
    bal: "ur"
  };
  return map[langHint] || undefined;
}

function normalizeAudio(inputPath) {
  return new Promise((resolve) => {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, "_clean.wav");

    const command = `ffmpeg -y -i "${inputPath}" -ac 1 -ar 16000 -af "highpass=f=120,lowpass=f=7600,volume=1.8" "${outputPath}"`;

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
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const cleanedPath = await normalizeAudio(filePath);
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
  }
}

module.exports = { transcribeAudio };