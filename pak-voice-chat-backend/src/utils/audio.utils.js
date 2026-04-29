// Audio normalization disabled on Vercel.
// No ffmpeg usage in serverless deployment.

async function normalizeAudioToMp3(inputPath) {
  return inputPath;
}

module.exports = {
  normalizeAudioToMp3,
};