require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const { startFakeWorker } = require("./workers/fake.worker");

const authRoutes = require("./auth/auth.routes");
const usersRoutes = require("./users/users.routes");
const conversationsRoutes = require("./conversations/conversations.routes");
const messagesRoutes = require("./messages/messages.routes");
const outputsRoutes = require("./outputs/outputs.routes");

const app = express();

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".mp3")) {
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
    },
  })
);

app.get("/health", (req, res) => {
  return res.json({ ok: true, status: "up" });
});

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/conversations", conversationsRoutes);
app.use("/messages", messagesRoutes);
app.use("/outputs", outputsRoutes);

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    error: "NOT_FOUND",
  });
});

// global error handler
app.use((err, req, res, next) => {
  console.error("[GLOBAL ERROR]", err);
  return res.status(500).json({
    ok: false,
    error: "SERVER_ERROR",
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  startFakeWorker();
});