const multer = require("multer");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const mime = file.mimetype || "";

  const isAudio = mime.startsWith("audio/");
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");

  if (!isAudio && !isImage && !isVideo) {
    return cb(new Error("ONLY_AUDIO_IMAGE_VIDEO_ALLOWED"), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

module.exports = upload;