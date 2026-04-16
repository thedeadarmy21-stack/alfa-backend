const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const { requireAuth } = require("../auth/auth.middleware");
const { query } = require("../db");
const cloudinary = require("../utils/cloudinary");

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
});

const textSchema = z.object({
  conversation_id: z.coerce.number().int().positive(),
  original_lang: z.enum(supportedLanguages),
  target_lang: z.enum(supportedLanguages),
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

function getVoiceIdByLanguage(language) {
  return process.env.ELEVENLABS_VOICE_EN;
}

/* -------------------- VOICE -------------------- */
router.post("/voice", requireAuth, (req, res) => {
  upload.single("audio")(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ ok: false, error: err.message });

      const parsed = voiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "VALIDATION_ERROR" });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "AUDIO_REQUIRED" });
      }

      const { conversation_id, original_lang, target_lang } = parsed.data;
      const me = req.user.id;

      const isMember = await ensureConversationMembership(conversation_id, me);
      if (!isMember)
        return res.status(403).json({ ok: false, error: "NOT_A_MEMBER" });

      /* ✅ Upload to Cloudinary */
      const uploadResult = await cloudinary.uploader.upload(
        "data:" +
          req.file.mimetype +
          ";base64," +
          req.file.buffer.toString("base64"),
        { resource_type: "auto" }
      );

      const audioUrl = uploadResult.secure_url;

      /* ✅ Save message */
      const insertRes = await query(
        `INSERT INTO messages (
          conversation_id, sender_id, type, original_lang,
          original_audio_url, status
        )
        VALUES ($1,$2,'voice',$3,$4,'processing')
        RETURNING *`,
        [conversation_id, me, original_lang, audioUrl]
      );

      const message = insertRes.rows[0];

      const receiverId = await getReceiverId(conversation_id, me);

      if (target_lang === original_lang) {
        await query(`UPDATE messages SET status='ready' WHERE id=$1`, [
          message.id,
        ]);
        return res.json({ ok: true, message });
      }

      await query(
        `INSERT INTO message_outputs 
         (message_id, receiver_id, target_lang, status)
         VALUES ($1,$2,$3,'processing')`,
        [message.id, receiverId, target_lang]
      );

      return res.json({ ok: true, message });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });
});

/* -------------------- TEXT -------------------- */
router.post("/text", requireAuth, async (req, res) => {
  try {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR" });

    const { conversation_id, original_lang, target_lang, text } = parsed.data;
    const me = req.user.id;

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

    await query(
      `INSERT INTO message_outputs 
       (message_id, receiver_id, target_lang, status)
       VALUES ($1,$2,$3,'processing')`,
      [message.id, receiverId, target_lang]
    );

    return res.json({ ok: true, message });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
});

/* -------------------- MEDIA -------------------- */
router.post("/media", requireAuth, (req, res) => {
  upload.single("media")(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ ok: false });

      const parsed = mediaSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ ok: false });

      if (!req.file)
        return res.status(400).json({ ok: false, error: "NO_FILE" });

      const { conversation_id, type } = parsed.data;
      const me = req.user.id;

      /* ✅ Upload */
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

      return res.json({ ok: true, message: insertRes.rows[0] });
    } catch (e) {
      return res.status(500).json({ ok: false });
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

    const result = await query(
      `SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC`,
      [conversation_id]
    );

    return res.json({ ok: true, messages: result.rows });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;