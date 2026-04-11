const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../auth/auth.middleware");
const { query } = require("../db");

const router = express.Router();

/**
 * POST /conversations
 * body: { member_email: "other@example.com" }
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      member_email: z.string().trim().toLowerCase().email(),
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const me = req.user.id;
    const memberEmail = parsed.data.member_email;

    const u = await query(
      `SELECT id, email, preferred_language, preferred_voice_id
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [memberEmail]
    );

    if (!u.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "USER_NOT_FOUND",
      });
    }

    const otherUser = u.rows[0];
    const other = otherUser.id;

    if (Number(other) === Number(me)) {
      return res.status(400).json({
        ok: false,
        error: "CANNOT_CHAT_WITH_SELF",
      });
    }

    const existing = await query(
      `SELECT c.id
       FROM conversations c
       JOIN conversation_members m1
         ON m1.conversation_id = c.id AND m1.user_id = $1
       JOIN conversation_members m2
         ON m2.conversation_id = c.id AND m2.user_id = $2
       WHERE c.type = 'direct'
       LIMIT 1`,
      [me, other]
    );

    if (existing.rows.length) {
      return res.json({
        ok: true,
        conversation: {
          conversation_id: existing.rows[0].id,
          other_user_id: otherUser.id,
          other_user_email: otherUser.email,
          other_user_preferred_language: otherUser.preferred_language,
          other_user_preferred_voice_id: otherUser.preferred_voice_id,
        },
        existed: true,
      });
    }

    const c = await query(
      `INSERT INTO conversations (type)
       VALUES ('direct')
       RETURNING id, type, created_at`,
      []
    );

    const conversation = c.rows[0];
    const convId = conversation.id;

    await query(
      `INSERT INTO conversation_members (conversation_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [convId, me, other]
    );

    return res.json({
      ok: true,
      conversation: {
        conversation_id: convId,
        other_user_id: otherUser.id,
        other_user_email: otherUser.email,
        other_user_preferred_language: otherUser.preferred_language,
        other_user_preferred_voice_id: otherUser.preferred_voice_id,
        created_at: conversation.created_at,
      },
      existed: false,
    });
  } catch (error) {
    console.error("[POST /conversations]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

/**
 * GET /conversations
 * lists my direct chats
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const me = req.user.id;

    const r = await query(
      `SELECT
         c.id AS conversation_id,
         c.created_at,
         u.id AS other_user_id,
         u.email AS other_user_email,
         u.preferred_language AS other_user_preferred_language,
         u.preferred_voice_id AS other_user_preferred_voice_id
       FROM conversations c
       JOIN conversation_members cm_me
         ON cm_me.conversation_id = c.id AND cm_me.user_id = $1
       JOIN conversation_members cm_other
         ON cm_other.conversation_id = c.id AND cm_other.user_id <> $1
       JOIN users u
         ON u.id = cm_other.user_id
       WHERE c.type = 'direct'
       ORDER BY c.created_at DESC`,
      [me]
    );

    return res.json({
      ok: true,
      conversations: r.rows,
    });
  } catch (error) {
    console.error("[GET /conversations]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

module.exports = router;