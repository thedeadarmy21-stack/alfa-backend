const fs = require("fs");
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function mapLanguage(langHint) {
  const map = {
    en: "en",
    ur: "ur",
    sd: "ur",
    ps: "ur",
    bal: "ur",
    hinglish: "hi",
    de: "de",
    es: "es",
    zh: "zh",
  };

  return map[langHint] || undefined;
}

async function transcribeAudio(filePath, langHint) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const language = mapLanguage(langHint);

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-large-v3",
      ...(language ? { language } : {}),
      prompt:
        "Transcribe exactly what is spoken. Do not translate. Do not summarize. Keep names, Urdu-English mixed words, and spoken phrasing exactly.",
      response_format: "json",
      temperature: 0,
    });

    const text = transcription?.text?.trim() || "";

    if (!text) {
      throw new Error("Empty transcription returned from STT");
    }

    return text;
  } catch (error) {
    console.error("[GROQ STT ERROR]", {
      message: error?.message,
      response: error?.response?.data,
    });

    throw error;
  }
}

module.exports = {
  transcribeAudio,
};