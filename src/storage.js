const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const isRender = String(process.env.RENDER || "").toLowerCase() === "true";
const isServerless = Boolean(
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY_DEV
);

// Render uses a persistent disk mounted by the deployment configuration.
// Local development falls back to the project's public uploads directory.
const CONFIGURED_UPLOAD_DIR = String(process.env.SFPS_UPLOAD_DIR || "").trim();

function writableParent(target) {
  try {
    const absolute = path.resolve(target);
    fs.mkdirSync(absolute, { recursive: true });
    fs.accessSync(absolute, fs.constants.W_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveUploadDirectory() {
  if (CONFIGURED_UPLOAD_DIR && writableParent(CONFIGURED_UPLOAD_DIR)) {
    return path.resolve(CONFIGURED_UPLOAD_DIR);
  }
  if (CONFIGURED_UPLOAD_DIR) {
    console.warn(`[SFPS] SFPS_UPLOAD_DIR is not writable: ${CONFIGURED_UPLOAD_DIR}. Falling back to /tmp/sfps-uploads/profiles.`);
  }
  if (isRender) {
    const renderDir = "/var/data/uploads/profiles";
    if (writableParent(renderDir)) return renderDir;
    console.warn("[SFPS] Render upload disk is not mounted/writable. Falling back to /tmp/sfps-uploads/profiles.");
    return path.join(os.tmpdir(), "sfps-uploads", "profiles");
  }
  if (isServerless) return path.join(os.tmpdir(), "sfps-uploads", "profiles");
  return path.join(ROOT, "public", "uploads", "profiles");
}

const UPLOAD_DIR = resolveUploadDirectory();

function ensureStorage() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

module.exports = { ROOT, UPLOAD_DIR, ensureStorage, isRender, isServerless };
