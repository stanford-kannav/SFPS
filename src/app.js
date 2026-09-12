require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db/database");
const { UPLOAD_DIR, ensureStorage } = require("./storage");

const app = express();

// Database and persistent upload storage are initialized before the first request.
const dbStatus = db.init();
ensureStorage();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/assets/"),
}));
app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    req.method === "GET" && req.path.startsWith("/assets/")
      ? "public, max-age=86400"
      : "no-store"
  );
  next();
});

// Accept both JSON and standard form submissions. This makes the login endpoint
// resilient to browsers, password managers, and direct form clients.
app.use(express.json({ limit: "2mb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(cookieParser());
app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.static(path.join(__dirname, "../public"), {
  index: "index.html",
  fallthrough: true,
}));
app.use("/uploads", express.static(UPLOAD_DIR, {
  maxAge: "1d",
  fallthrough: false,
}));

app.get("/api/health", (req, res) => res.json({
  ok: true,
  service: "SFPS",
  database: dbStatus.engine,
  formats: dbStatus.formats,
  dataPath: dbStatus.path,
  persistentData: dbStatus.persistent,
  node: process.version,
}));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/students", require("./routes/students"));
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/academic", require("./routes/academic"));
app.use("/api/seat-planner", require("./routes/seatPlanner"));
app.use("/api/access", require("./routes/access"));
app.use("/api/developer-console", require("./routes/developer-console"));
app.use("/api/yt", require("./routes/yt"));

app.use((err, req, res, next) => {
  console.error("SFPS request error:", err);
  if (res.headersSent) return next(err);
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid request data." });
  }
  return res.status(500).json({ error: "SFPS server error. Please retry." });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "SFPS API route not found." });
  }
  return res.sendFile(path.join(__dirname, "../public/index.html"));
});

module.exports = app;
