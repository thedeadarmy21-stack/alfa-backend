const express = require("express");
const { z } = require("zod");
const { query } = require("../db");
const { requireAuth } = require("../auth/auth.middleware");

const router = express.Router();

const prefSchema = z.object({
  preferred_language: z
    .enum(["en", "ur", "sd", "ps", "bal", "de", "hinglish", "es", "zh"])
    .optional(),
  preferred_voice_id: z.string().min(2).max(64).optional(),
});

async function getUserById(userId) {
  const result = await query(
    `SELECT id, email, preferred_language, preferred_voice_id, created_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

/* -------------------- GET /users/me -------------------- */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      user,
    });
  } catch (error) {
    console.error("[GET /users/me]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

/* -------------------- PUT /users/me/preferences -------------------- */
router.put("/me/preferences", requireAuth, async (req, res) => {
  try {
    const parsed = preferenceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const { preferred_language, preferred_voice_id } = parsed.data;

    if (!preferred_language && !preferred_voice_id) {
      return res.status(400).json({
        ok: false,
        error: "NOTHING_TO_UPDATE",
      });
    }

    const currentUser = await getUserById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    const nextPreferredLanguage =
      preferred_language ?? currentUser.preferred_language;

    const nextPreferredVoiceId =
      preferred_voice_id ?? currentUser.preferred_voice_id;

    const updateResult = await query(
      `UPDATE users
       SET preferred_language = $1,
           preferred_voice_id = $2
       WHERE id = $3
       RETURNING id, email, preferred_language, preferred_voice_id, created_at`,
      [nextPreferredLanguage, nextPreferredVoiceId, req.user.id]
    );

    return res.json({
      ok: true,
      user: updateResult.rows[0],
    });
  } catch (error) {
    console.error("[PUT /users/me/preferences]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

module.exports = router;