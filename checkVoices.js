require("dotenv").config();
const { ElevenLabsClient } = require("elevenlabs");

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

async function listVoices() {
  try {
    const res = await client.voices.getAll();

    console.log("\n===== AVAILABLE VOICES =====\n");

    res.voices.forEach((voice, index) => {
      console.log(`${index + 1}. Name: ${voice.name}`);
      console.log(`   ID: ${voice.voice_id}`);
      console.log(`   Category: ${voice.category}`);
      console.log("-----------------------------------");
    });

  } catch (err) {
    console.error("Error fetching voices:", err.message);
  }
}

listVoices();