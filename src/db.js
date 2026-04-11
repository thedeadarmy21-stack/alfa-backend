const { neon } = require("@neondatabase/serverless");
require("dotenv").config();

const sql = neon(process.env.DATABASE_URL);

async function query(text, params = []) {
  try {
    // Debug guard: placeholders hain aur params missing
    const needsParams = /\$\d+/.test(text);
    if (needsParams && (!params || params.length === 0)) {
      console.error("DB PARAMS MISSING for query:", text);
      throw new Error("DB_PARAMS_MISSING");
    }

    const result = await sql.query(text, params);

    return {
      rows: Array.isArray(result) ? result : (result.rows || []),
    };
  } catch (error) {
    console.error("Database Query Error:", error.message);
    throw error;
  }
}

module.exports = { query };