const Groq = require("groq-sdk");

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function getLanguageName(code) {
  const map = {
    en: "English",
    ur: "Urdu",
    sd: "Sindhi",
    ps: "Pashto",
    bal: "Balochi",
    de: "German",
    hinglish: "Hinglish (Roman Urdu/Hindi mixed with English)",
    es: "Spanish",
    zh: "Chinese",
  };

  return map[code] || code;
}

function normalizeTranslatedText(text) {
  return String(text || "")
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .trim();
}

async function translateText(text, targetLang, sourceLang) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    throw new Error("Empty text passed to translateText");
  }

  if (!targetLang || !sourceLang) {
    throw new Error("sourceLang and targetLang are required");
  }

  if (targetLang === sourceLang) {
    return cleanText;
  }

  const sourceName = getLanguageName(sourceLang);
  const targetName = getLanguageName(targetLang);

  const systemPrompt = `
You are a strict translation engine.

Rules:
1. Translate the user's text from ${sourceName} to ${targetName}.
2. Return ONLY the translated text.
3. Do not explain anything.
4. Do not keep the source language unless a word is truly untranslatable.
5. Preserve the meaning, tone, and poetic style if the text is poetic.
6. If the source is Hinglish, first understand it correctly, then translate into the target language.
7. Your output MUST be entirely in ${targetName}, not in ${sourceName}.
`;

  const userPrompt = `
Source language: ${sourceName}
Target language: ${targetName}

Text:
${cleanText}
`;

  const completion = await client.chat.completions.create({
    model: process.env.GROQ_TRANSLATE_MODEL || "llama-3.3-70b-versatile",
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: userPrompt.trim() },
    ],
  });

  const translated =
    completion?.choices?.[0]?.message?.content || "";

  const finalText = normalizeTranslatedText(translated);

  if (!finalText) {
    throw new Error("Empty translation returned from model");
  }

  return finalText;
}

module.exports = {
  translateText,
  getLanguageName,
};