const path = require("path");
const fs = require("fs");
const { query } = require("../db");
const { translateText } = require("../translate/translate.service");
const { transcribeAudio } = require("../stt/stt.service");
const { generateSpeech } = require("../tts/tts.service");

let isProcessing = false;

function resolveAudioPath(audioUrl) {
  if (!audioUrl) return null;

  const cleanUrl = String(audioUrl).trim().replace(/\\/g, "/");

  if (path.isAbsolute(cleanUrl) && fs.existsSync(cleanUrl)) {
    return cleanUrl;
  }

  return path.join(process.cwd(), "uploads", path.basename(cleanUrl));
}

async function runFakeProcessing() {
  if (isProcessing) return;
  isProcessing = true;

  let messageId = null;
  let outputId = null;

  try {
    const msgRes = await query(
      `SELECT id, type, text_body, original_audio_url, original_lang
       FROM messages
       WHERE status = 'processing'
       ORDER BY created_at ASC
       LIMIT 1`,
      []
    );

    if (!msgRes.rows.length) {
      return;
    }

    messageId = msgRes.rows[0].id;

    const {
      type,
      text_body,
      original_audio_url,
      original_lang,
    } = msgRes.rows[0];

    console.log(`[Worker] Processing message ${messageId}`);

    const outRes = await query(
      `SELECT id, target_lang
       FROM message_outputs
       WHERE message_id = $1
       LIMIT 1`,
      [messageId]
    );

    if (!outRes.rows.length) {
      console.log(
        `[Worker] No output row found yet for message ${messageId}, will retry`
      );
      return;
    }

    outputId = outRes.rows[0].id;
    const { target_lang } = outRes.rows[0];

    let sourceText = (text_body || "").trim();

    if (!sourceText && original_audio_url) {
      const absPath = resolveAudioPath(original_audio_url);

      if (absPath && fs.existsSync(absPath)) {
        console.log(`[Worker] STT running for message ${messageId}`);
        sourceText = await transcribeAudio(absPath, original_lang);
      }
    }

    if (!sourceText) {
      throw new Error("No source text available");
    }

    console.log(`[Worker] Source text: ${sourceText}`);

let finalText = sourceText;

// Voice messages ke liye bhi translation skip karo agar languages same hain
if (target_lang && original_lang && target_lang !== original_lang) {
  console.log(`[Worker] Translating ${original_lang} → ${target_lang}`);
  finalText = await translateText(sourceText, target_lang, original_lang);
} else {
  console.log(`[Worker] Translation skipped (${original_lang} → ${target_lang})`);
  finalText = sourceText; // No translation
}

    console.log(`[Worker] Final text: ${finalText}`);
console.log(
  `[Worker] Translation result check | sourceLang=${original_lang} | targetLang=${target_lang}`
);
    let ttsAudioUrl = null;
    let ttsFailed = false;

    if (type === "voice") {
      try {
        ttsAudioUrl = await generateSpeech(
          finalText,
          target_lang || original_lang || "en"
        );
        console.log(`[Worker] TTS success: ${ttsAudioUrl}`);
      } catch (ttsErr) {
        ttsFailed = true;
        console.error(`[Worker] TTS failed:`, ttsErr);
      }
    } else {
      console.log(`[Worker] TTS skipped for non-voice message ${messageId}`);
    }

    await query(
      `UPDATE message_outputs
       SET translated_text = $1,
           tts_audio_url = $2,
           status = $3
       WHERE id = $4`,
      [finalText, ttsAudioUrl, ttsFailed ? "failed" : "ready", outputId]
    );

    await query(
      `UPDATE messages
       SET text_body = $1,
           status = 'ready'
       WHERE id = $2`,
      [sourceText, messageId]
    );

    if (ttsFailed) {
      console.log(`[Worker] Message ${messageId} translated, but TTS failed`);
    } else {
      console.log(`[Worker] Message ${messageId} DONE`);
    }
  } catch (error) {
    console.error(`[Worker] ERROR for message ${messageId}:`, error);

    if (outputId) {
      await query(
        `UPDATE message_outputs
         SET status = 'failed'
         WHERE id = $1`,
        [outputId]
      );
    }

    if (messageId) {
      await query(
        `UPDATE messages
         SET status = 'failed'
         WHERE id = $1`,
        [messageId]
      );
    }
  } finally {
    isProcessing = false;
  }
}

function startFakeWorker() {
  console.log("[Worker] Fake worker started");

  setInterval(() => {
    runFakeProcessing().catch((err) => {
      console.error("[Worker Interval Error]", err);
    });
  }, 3000);
}

module.exports = { runFakeProcessing, startFakeWorker };