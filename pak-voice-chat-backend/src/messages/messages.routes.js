const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const { requireAuth } = require("../auth/auth.middleware");
const { query } = require("../db");
const cloudinary = require("../utils/cloudinary");
const { translateText } = require("../translate/translate.service");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { transcribeAudio } = require("../stt/stt.service");
const { generateSpeechBuffer } = require("../tts/tts.service");

const router = express.Router();

/* -------------------- Upload setup (MEMORY) -------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

/* -------------------- Supported Languages -------------------- */
const supportedLanguages = [
  "en",
  "ur",
  "sd",
  "ps",
  "bal",
  "de",
  "hinglish",
  "es",
  "zh",
];

/* -------------------- Schemas -------------------- */
const voiceSchema = z.object({
  conversation_id: z.coerce.number().int().positive(),
  original_lang: z.enum(supportedLanguages),
  target_lang: z.enum(supportedLanguages),
  translate_mode: z.coerce.boolean().default(false),
});

const textSchema = z.object({
  conversation_id: z.coerce.number().int().positive(),
  original_lang: z.enum(supportedLanguages),
  target_lang: z.enum(supportedLanguages),
  translate_mode: z.coerce.boolean().default(false),
  text: z.string().min(1).max(4000),
});

const mediaSchema = z.object({
  conversation_id: z.coerce.number().int().positive(),
  type: z.enum(["image", "video"]),
});

const getMessagesSchema = z.object({
  conversation_id: z.coerce.number().int().positive(),
});

/* -------------------- Helpers -------------------- */
async function ensureConversationMembership(conversationId, userId) {
  const res = await query(
    `SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2 LIMIT 1`,
    [conversationId, userId]
  );
  return res.rows.length > 0;
}

async function getReceiverId(conversationId, senderId) {
  const res = await query(
    `SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2 LIMIT 1`,
    [conversationId, senderId]
  );
  return res.rows[0]?.user_id || null;
}

function ensureTempDir() {
  const tempDir = path.join(os.tmpdir(), "alfa-temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function getExtensionFromMimeType(mimeType) {
  if (!mimeType) return ".webm";
  if (mimeType.includes("mpeg")) return ".mp3";
  if (mimeType.includes("mp3")) return ".mp3";
  if (mimeType.includes("wav")) return ".wav";
  if (mimeType.includes("ogg")) return ".ogg";
  if (mimeType.includes("mp4")) return ".mp4";
  if (mimeType.includes("webm")) return ".webm";
  return ".webm";
}

function uploadBufferToCloudinary(buffer, folder = "alfa-tts") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder,
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

/* -------------------- VOICE -------------------- */
router.post("/voice", requireAuth, (req, res) => {
  upload.single("audio")(req, res, async (err) => {
    let tempInputPath = null;

    try {
      if (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }

      const parsed = voiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "VALIDATION_ERROR" });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "AUDIO_REQUIRED" });
      }

      const { conversation_id, original_lang, target_lang, translate_mode } = parsed.data;
      const me = req.user.id;

      const isMember = await ensureConversationMembership(conversation_id, me);
      if (!isMember) {
        return res.status(403).json({ ok: false, error: "NOT_A_MEMBER" });
      }

      const receiverId = await getReceiverId(conversation_id, me);
      if (!receiverId) {
        return res.status(400).json({ ok: false, error: "RECEIVER_NOT_FOUND" });
      }

      const tempDir = ensureTempDir();
      const fileExt = getExtensionFromMimeType(req.file.mimetype);
      tempInputPath = path.join(
        tempDir,
        `voice_${Date.now()}_${Math.random().toString(36).slice(2)}${fileExt}`
      );

      await fs.promises.writeFile(tempInputPath, req.file.buffer);

      const originalUploadResult = await cloudinary.uploader.upload(tempInputPath, {
        resource_type: "auto",
      });

      const originalAudioUrl = originalUploadResult.secure_url;

      const insertRes = await query(
        `INSERT INTO messages (
          conversation_id, sender_id, type, original_lang,
          original_audio_url, status
        )
        VALUES ($1,$2,'voice',$3,$4,'processing')
        RETURNING *`,
        [conversation_id, me, original_lang, originalAudioUrl]
      );

      const message = insertRes.rows[0];

      const sourceText = await transcribeAudio(tempInputPath, original_lang);

      const shouldTranslate =
        translate_mode === true &&
        target_lang &&
        original_lang &&
        target_lang !== original_lang;

      // ✅ B) shouldTranslate ke baad outputId conditional create karo
      let outputId = null;

      if (shouldTranslate) {
        const outputInsert = await query(
          `INSERT INTO message_outputs
           (message_id, receiver_id, target_lang, status)
           VALUES ($1,$2,$3,'processing')
           RETURNING id`,
          [message.id, receiverId, target_lang]
        );

        outputId = outputInsert.rows[0].id;
      }

      let finalText = sourceText;
      if (shouldTranslate) {
        finalText = await translateText(sourceText, target_lang, original_lang);
      }

      let ttsAudioUrl = null;

      if (shouldTranslate) {
        try {
          const ttsBuffer = await generateSpeechBuffer(finalText, target_lang);
          ttsAudioUrl = await uploadBufferToCloudinary(ttsBuffer, "alfa-translated-voice");
        } catch (ttsError) {
          console.error("[VOICE ROUTE TTS ERROR]", {
            message: ttsError?.message,
            statusCode: ttsError?.statusCode,
            body: ttsError?.body,
            stack: ttsError?.stack,
          });
        }
      }

      // ✅ C) Output update query ko condition me rakho
      if (shouldTranslate && outputId) {
        await query(
          `UPDATE message_outputs
           SET translated_text = $1,
               tts_audio_url = $2,
               status = $3
           WHERE id = $4`,
          [
            finalText,
            ttsAudioUrl,
            ttsAudioUrl ? "ready" : "failed",
            outputId,
          ]
        );
      }

      await query(
        `UPDATE messages
         SET text_body = $1,
             status = 'ready'
         WHERE id = $2`,
        [sourceText, message.id]
      );

      return res.json({
        ok: true,
        message: {
          ...message,
          text_body: sourceText,
          status: "ready",
        },
      });
    } catch (e) {
      console.error("[POST /messages/voice]", e);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    } finally {
      if (tempInputPath && fs.existsSync(tempInputPath)) {
        try {
          fs.unlinkSync(tempInputPath);
        } catch {}
      }
    }
  });
});

/* -------------------- TEXT -------------------- */
router.post("/text", requireAuth, async (req, res) => {
  try {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR" });
    }

    const { conversation_id, original_lang, target_lang, translate_mode, text } = parsed.data;
    const me = req.user.id;

    const isMember = await ensureConversationMembership(conversation_id, me);
    if (!isMember) {
      return res.status(403).json({ ok: false, error: "NOT_A_MEMBER" });
    }

    const insertRes = await query(
      `INSERT INTO messages (
        conversation_id, sender_id, type,
        original_lang, text_body, status
      )
      VALUES ($1,$2,'text',$3,$4,'processing')
      RETURNING *`,
      [conversation_id, me, original_lang, text]
    );

    const message = insertRes.rows[0];
    const receiverId = await getReceiverId(conversation_id, me);

    const outputInsert = await query(
      `INSERT INTO message_outputs 
       (message_id, receiver_id, target_lang, status)
       VALUES ($1,$2,$3,'processing')
       RETURNING id`,
      [message.id, receiverId, target_lang]
    );

    const shouldTranslate =
      translate_mode === true &&
      target_lang &&
      original_lang &&
      target_lang !== original_lang;

    let finalText = text;
    if (shouldTranslate) {
      finalText = await translateText(text, target_lang, original_lang);
    }

    await query(
      `UPDATE message_outputs
       SET translated_text = $1,
           status = $2
       WHERE id = $3`,
      [
        shouldTranslate ? finalText : null,
        "ready",
        outputInsert.rows[0].id,
      ]
    );

    await query(
      `UPDATE messages
       SET status = 'ready'
       WHERE id = $1`,
      [message.id]
    );

    return res.json({
      ok: true,
      message: {
        ...message,
        status: "ready",
        translated_text: shouldTranslate ? finalText : null,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
});

/* -------------------- MEDIA -------------------- */
router.post("/media", requireAuth, (req, res) => {
  upload.single("media")(req, res, async (err) => {
    try {
      if (err) {
        return res.status(400).json({
          ok: false,
          error: err.message || "UPLOAD_ERROR",
        });
      }

      const parsed = mediaSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "NO_FILE",
        });
      }

      const { conversation_id, type } = parsed.data;
      const me = req.user.id;

      const isMember = await ensureConversationMembership(conversation_id, me);
      if (!isMember) {
        return res.status(403).json({
          ok: false,
          error: "NOT_A_MEMBER",
        });
      }

      const uploadResult = await cloudinary.uploader.upload(
        "data:" +
          req.file.mimetype +
          ";base64," +
          req.file.buffer.toString("base64"),
        { resource_type: "auto" }
      );

      const mediaUrl = uploadResult.secure_url;

      const insertRes = await query(
        `INSERT INTO messages (
          conversation_id, sender_id, type,
          original_lang, original_audio_url, status
        )
        VALUES ($1,$2,$3,'en',$4,'ready')
        RETURNING *`,
        [conversation_id, me, type, mediaUrl]
      );

      return res.json({
        ok: true,
        message: insertRes.rows[0],
      });
    } catch (e) {
      console.error("[POST /messages/media]", e);
      return res.status(500).json({
        ok: false,
        error: "SERVER_ERROR",
      });
    }
  });
});

/* -------------------- GET MESSAGES -------------------- */
router.get("/", requireAuth, async (req, res) => {
  try {
    const parsed = getMessagesSchema.safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ ok: false });

    const { conversation_id } = parsed.data;
    const me = req.user.id;
    const isMember = await ensureConversationMembership(conversation_id, me);

    if (!isMember) {
      return res.status(403).json({ ok: false, error: "NOT_A_MEMBER" });
    }

    const result = await query(
      `SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC`,
      [conversation_id]
    );

    return res.json({ ok: true, messages: result.rows });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* -------------------- GET WITH OUTPUTS -------------------- */
router.get("/with-outputs", requireAuth, async (req, res) => {
  try {
    const parsed = getMessagesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR" });
    }

    const { conversation_id } = parsed.data;
    const me = req.user.id;

    const isMember = await ensureConversationMembership(conversation_id, me);
    if (!isMember) {
      return res.status(403).json({ ok: false, error: "NOT_A_MEMBER" });
    }

    const result = await query(
      `SELECT
         m.id,
         m.conversation_id,
         m.sender_id,
         m.type,
         m.original_lang,
         m.original_audio_url,
         m.status,
         m.created_at,
         m.text_body,
         mo.id AS output_id,
         mo.message_id AS output_message_id,
         mo.receiver_id AS output_receiver_id,
         mo.target_lang AS output_target_lang,
         mo.tts_voice_id AS output_tts_voice_id,
         mo.translated_text AS output_translated_text,
         mo.tts_audio_url AS output_tts_audio_url,
         mo.status AS output_status,
         mo.created_at AS output_created_at
       FROM messages m
       LEFT JOIN message_outputs mo
         ON mo.message_id = m.id
        AND mo.receiver_id = $2
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversation_id, me]
    );

    const messages = result.rows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      type: row.type,
      original_lang: row.original_lang,
      original_audio_url: row.original_audio_url,
      status: row.status,
      created_at: row.created_at,
      text_body: row.text_body,
    }));

    const outputs = result.rows
      .filter((row) => row.output_id)
      .map((row) => ({
        id: row.output_id,
        message_id: row.output_message_id,
        receiver_id: row.output_receiver_id,
        target_lang: row.output_target_lang,
        tts_voice_id: row.output_tts_voice_id,
        translated_text: row.output_translated_text,
        tts_audio_url: row.output_tts_audio_url,
        status: row.output_status,
        created_at: row.output_created_at,
      }));

    return res.json({
      ok: true,
      messages,
      outputs,
    });
  } catch (error) {
    console.error("[GET /messages/with-outputs]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

module.exports = router;