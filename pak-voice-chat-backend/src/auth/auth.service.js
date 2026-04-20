const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { query } = require("../db");

function signToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing in environment");
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
}

function toSafeUser(user) {
  return {
    id: user.id,
    email: user.email,
    preferred_language: user.preferred_language,
    preferred_voice_id: user.preferred_voice_id,
    created_at: user.created_at,
  };
}

async function register({ email, password }) {
  const emailLower = email.trim().toLowerCase();

  const existing = await query(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [emailLower]
  );

  if (existing.rows.length) {
    return {
      ok: false,
      error: "EMAIL_ALREADY_EXISTS",
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const res = await query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, preferred_language, preferred_voice_id, created_at`,
    [emailLower, passwordHash]
  );

  const user = res.rows[0];
  const safeUser = toSafeUser(user);
  const token = signToken(safeUser);

  return {
    ok: true,
    user: safeUser,
    token,
  };
}

async function login({ email, password }) {
  const emailLower = email.trim().toLowerCase();

  const res = await query(
    `SELECT id, email, password_hash, preferred_language, preferred_voice_id, created_at
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [emailLower]
  );

  if (!res.rows.length) {
    return {
      ok: false,
      error: "INVALID_CREDENTIALS",
    };
  }

  const user = res.rows[0];

  const match = await bcrypt.compare(password, user.password_hash);

  if (!match) {
    return {
      ok: false,
      error: "INVALID_CREDENTIALS",
    };
  }

  const safeUser = toSafeUser(user);
  const token = signToken(safeUser);

  return {
    ok: true,
    user: safeUser,
    token,
  };
}

module.exports = { register, login };