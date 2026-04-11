const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../auth/auth.middleware");
const { query } = require("../db");

const router = express.Router();

// GET /outputs?message_id=123
router.get("/", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      message_id: z.coerce.number().int().positive(),
    });

    const parsed = schema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const me = req.user.id;
    const { message_id } = parsed.data;

    const r = await query(
      `SELECT
         mo.id,
         mo.message_id,
         mo.receiver_id,
         mo.target_lang,
         mo.tts_voice_id,
         mo.translated_text,
         mo.tts_audio_url,
         mo.status,
         mo.created_at
       FROM message_outputs mo
       JOIN messages m
         ON m.id = mo.message_id
       JOIN conversation_members cm
         ON cm.conversation_id = m.conversation_id
       WHERE mo.message_id = $1
         AND mo.receiver_id = $2
         AND cm.user_id = $2
       LIMIT 1`,
      [message_id, me]
    );

    if (!r.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      output: r.rows[0],
    });
  } catch (error) {
    console.error("[GET /outputs]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

module.exports = router;