// Legacy worker disabled.
// Vercel serverless backend processes messages inline inside messages.routes.js.
// Do not import old TTS/ffmpeg services here.

async function runFakeProcessing() {
  return null;
}

function startFakeWorker() {
  console.log("[Worker] Disabled: inline message processing is active");
}

module.exports = {
  runFakeProcessing,
  startFakeWorker,
};