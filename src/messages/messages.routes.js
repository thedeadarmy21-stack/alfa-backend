const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { z } = require("zod");
const { requireAuth } = require("../auth/auth.middleware");
const { query } = require("../db");
const { normalizeAudioToMp3 } = require("../utils/audio.utils");

const router = express.Router();

/* -------------------- Upload setup -------------------- */
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".webm";
    const safeExt = [
      ".m4a",
      ".aac",
      ".mp3",
      ".wav",
      ".ogg",
      ".webm",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".mp4",
      ".mov",
      ".mkv",
    ].includes(ext)
      ? ext
      : ".bin";

    cb(
      null,
      `voice_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`
    );
  },
});

function fileFilter(req, file, cb) {
  const mime = file.mimetype || "";

  const isAudio = mime.startsWith("audio/") || mime === "application/ogg";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");

  if (!isAudio && !isImage && !isVideo) {
    return cb(new Error("ONLY_AUDIO_IMAGE_VIDEO_ALLOWED"));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
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

/* -------------------- Validation Schemas -------------------- */
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
  const memberRes = await query(
    `SELECT 1
     FROM conversation_members
     WHERE conversation_id = $1 AND user_id = $2
     LIMIT 1`,
    [conversationId, userId]
  );

  return memberRes.rows.length > 0;
}

async function getReceiverId(conversationId, senderId) {
  const otherRes = await query(
    `SELECT user_id
     FROM conversation_members
     WHERE conversation_id = $1
       AND user_id <> $2
     LIMIT 1`,
    [conversationId, senderId]
  );

  return otherRes.rows[0]?.user_id || null;
}

function getVoiceIdByLanguage(language) {
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
    de: process.env.ELEVENLABS_VOICE_DE || process.env.ELEVENLABS_VOICE_EN,
    hinglish: process.env.ELEVENLABS_VOICE_EN,
    es: process.env.ELEVENLABS_VOICE_ES || process.env.ELEVENLABS_VOICE_EN,
    zh: process.env.ELEVENLABS_VOICE_ZH || process.env.ELEVENLABS_VOICE_EN,
  };

  return voiceMap[language] || process.env.ELEVENLABS_VOICE_EN || "en_default_1";
}

/* -------------------- 1) POST /messages/voice -------------------- */
router.post("/voice", requireAuth, (req, res) => {
  upload.single("audio")(req, res, async (err) => {
    try {
      if (err) {
        console.error("[POST /messages/voice] Upload error:", err.message);
        return res.status(400).json({
          ok: false,
          error: err.message || "UPLOAD_ERROR",
        });
      }

      const parsed = voiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        });
      }
      console.log("[VOICE] req.body =", req.body);
      console.log("[VOICE] req.file =", req.file);
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "AUDIO_REQUIRED",
        });
      }

      const { conversation_id, original_lang, target_lang } = parsed.data;
      const me = req.user.id;

      const isMember = await ensureConversationMembership(conversation_id, me);
      if (!isMember) {
        return res.status(403).json({
          ok: false,
          error: "NOT_A_MEMBER",
        });
      }

      let normalizedFilePath = req.file.path;

      try {
        const maybeNormalizedPath = await normalizeAudioToMp3(req.file.path);
        if (maybeNormalizedPath) {
          normalizedFilePath = maybeNormalizedPath;
        }
      } catch (normalizeError) {
        console.error("[POST /messages/voice] Normalize error:", normalizeError);
        return res.status(500).json({
          ok: false,
          error: "AUDIO_NORMALIZE_FAILED",
        });
      }

      const audioUrl = `/uploads/${path.basename(normalizedFilePath)}`;

      const insertRes = await query(
        `INSERT INTO messages (
          conversation_id,
          sender_id,
          type,
          original_lang,
          original_audio_url,
          status,
          text_body
        )
        VALUES ($1, $2, 'voice', $3, $4, 'processing', NULL)
        RETURNING id, conversation_id, sender_id, type, original_lang, original_audio_url, status, created_at, text_body`,
        [conversation_id, me, original_lang, audioUrl]
      );

      const message = insertRes.rows[0];

      const receiverId = await getReceiverId(conversation_id, me);
      if (!receiverId) {
        return res.status(400).json({
          ok: false,
          error: "RECEIVER_NOT_FOUND",
        });
      }

      if (target_lang === original_lang) {
        await query(`UPDATE messages SET status='ready' WHERE id=$1`, [
          message.id,
        ]);

        return res.json({
          ok: true,
          message: {
            ...message,
            status: "ready",
          },
        });
      }

      const voiceId = getVoiceIdByLanguage(target_lang);

      console.log("[VOICE] sender-selected target:", target_lang);
      console.log("[VOICE] receiver id:", receiverId);
      console.log("[VOICE] voice id:", voiceId);

      await query(
        `INSERT INTO message_outputs (
          message_id,
          receiver_id,
          target_lang,
          tts_voice_id,
          status
        )
        VALUES ($1, $2, $3, $4, 'processing')`,
        [message.id, receiverId, target_lang, voiceId]
      );

      await query(`UPDATE messages SET status='processing' WHERE id=$1`, [
        message.id,
      ]);

      console.log("[VOICE] message_output inserted for message:", message.id);

      return res.json({
        ok: true,
        message: {
          ...message,
          status: "processing",
        },
      });
    } catch (error) {
      console.error("[POST /messages/voice]", error);
      return res.status(500).json({
        ok: false,
        error: "SERVER_ERROR",
      });
    }
  });
});

/* -------------------- 2) POST /messages/text -------------------- */
router.post("/text", requireAuth, async (req, res) => {
  try {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const { conversation_id, original_lang, target_lang, text } = parsed.data;
    const me = req.user.id;

    const isMember = await ensureConversationMembership(conversation_id, me);
    if (!isMember) {
      return res.status(403).json({
        ok: false,
        error: "NOT_A_MEMBER",
      });
    }

    const insertRes = await query(
      `INSERT INTO messages (
        conversation_id,
        sender_id,
        type,
        original_lang,
        original_audio_url,
        status,
        text_body
      )
      VALUES ($1, $2, 'text', $3, NULL, 'processing', $4)
      RETURNING id, conversation_id, sender_id, type, original_lang, original_audio_url, status, created_at, text_body`,
      [conversation_id, me, original_lang, text.trim()]
    );

    const message = insertRes.rows[0];

    const receiverId = await getReceiverId(conversation_id, me);
    if (!receiverId) {
      return res.status(400).json({
        ok: false,
        error: "RECEIVER_NOT_FOUND",
      });
    }

    const voiceId = getVoiceIdByLanguage(target_lang);

    console.log("[TEXT] sender-selected target:", target_lang);
    console.log("[TEXT] receiver id:", receiverId);
    console.log("[TEXT] voice id:", voiceId);

    await query(
      `INSERT INTO message_outputs (
        message_id,
        receiver_id,
        target_lang,
        tts_voice_id,
        status
      )
      VALUES ($1, $2, $3, $4, 'processing')`,
      [message.id, receiverId, target_lang, voiceId]
    );

    console.log("[TEXT] message_output inserted for message:", message.id);

    return res.json({ ok: true, message });
  } catch (error) {
    console.error("[POST /messages/text]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

/* -------------------- 3) POST /messages/media -------------------- */
router.post("/media", requireAuth, (req, res) => {
  upload.single("media")(req, res, async (err) => {
    try {
      if (err) {
        console.error("[POST /messages/media] Upload error:", err.message);
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
          details: parsed.error.flatten(),
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "MEDIA_REQUIRED",
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

      const mediaUrl = `/uploads/${req.file.filename}`;

      const insertRes = await query(
        `INSERT INTO messages (
          conversation_id,
          sender_id,
          type,
          original_lang,
          original_audio_url,
          status,
          text_body
        )
        VALUES ($1, $2, $3, 'en', $4, 'ready', NULL)
        RETURNING id, conversation_id, sender_id, type, original_lang, original_audio_url, status, created_at, text_body`,
        [conversation_id, me, type, mediaUrl]
      );

      return res.json({
        ok: true,
        message: insertRes.rows[0],
      });
    } catch (error) {
      console.error("[POST /messages/media]", error);
      return res.status(500).json({
        ok: false,
        error: "SERVER_ERROR",
      });
    }
  });
});

/* -------------------- 4) GET /messages -------------------- */
router.get("/", requireAuth, async (req, res) => {
  try {
    const parsed = getMessagesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const { conversation_id } = parsed.data;
    const me = req.user.id;

    const isMember = await ensureConversationMembership(conversation_id, me);
    if (!isMember) {
      return res.status(403).json({
        ok: false,
        error: "NOT_A_MEMBER",
      });
    }

    const result = await query(
      `SELECT id, conversation_id, sender_id, type, original_lang, original_audio_url, status, created_at, text_body
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversation_id]
    );

    return res.json({
      ok: true,
      messages: result.rows,
    });
  } catch (error) {
    console.error("[GET /messages]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

module.exports = router;