const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, (error, stdout, stderr) => {
      if (error) {
        console.error("[FFMPEG ERROR]", stderr || error.message);
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

async function normalizeAudioToMp3(inputPath) {
  if (!inputPath) {
    throw new Error("inputPath is required");
  }

  const parsed = path.parse(inputPath);
  
  // Always create a unique temp file
  const tempOutputPath = path.join(parsed.dir, `${parsed.name}_temp_fixed.mp3`);
  
  // Final output path - always .mp3 extension
  const finalOutputPath = path.join(parsed.dir, `${parsed.name}.mp3`);

  // Browser-friendly mp3
 const ffmpegArgs = [
  "-y",
  "-i",
  inputPath,
  "-vn",
  "-map_metadata",
  "-1",
  "-acodec",
  "libmp3lame",
  "-ar",
  "44100",
  "-ac",
  "2",
  "-b:a",
  "192k",
  "-f",
  "mp3",
  "-id3v2_version",
  "3",
  "-write_xing",
  "0",
  tempOutputPath,
];

  await runFfmpeg(ffmpegArgs);

  if (!fs.existsSync(tempOutputPath)) {
    throw new Error("FFmpeg did not create normalized file");
  }

  // If final output already exists, delete it
  if (fs.existsSync(finalOutputPath)) {
    try {
      fs.unlinkSync(finalOutputPath);
    } catch (err) {
      console.error("[Normalize] Could not delete old file:", err.message);
    }
  }

  // Rename temp to final
  fs.renameSync(tempOutputPath, finalOutputPath);

  if (!fs.existsSync(finalOutputPath)) {
    throw new Error("Final normalized audio file not found");
  }

  // Clean up input file if it's different from final (and not needed)
  if (inputPath !== finalOutputPath && fs.existsSync(inputPath)) {
    try {
      fs.unlinkSync(inputPath);
    } catch (err) {
      console.error("[Normalize] Could not delete input file:", err.message);
    }
  }

  return finalOutputPath;
}

module.exports = {
  normalizeAudioToMp3,
};