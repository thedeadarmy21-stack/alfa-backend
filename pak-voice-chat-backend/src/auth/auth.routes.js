const express = require("express");
const { z } = require("zod");
const { register, login } = require("./auth.service");

const router = express.Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const result = await register(parsed.data);

    if (!result.ok) {
      return res.status(409).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("[POST /auth/register]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const result = await login(parsed.data);

    if (!result.ok) {
      return res.status(401).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("[POST /auth/login]", error);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
});

module.exports = router;