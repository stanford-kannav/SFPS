const crypto = require("crypto");
const db = require("../db/database");

const TTL = 12 * 60 * 60 * 1000;
const COOKIE = "sfps_session";

function sessionSecret() {
  const configured = String(process.env.SFPS_SESSION_SECRET || "").trim();
  if (configured.length >= 32) return configured;
  if (!globalThis.__SFPS_EPHEMERAL_SESSION_SECRET) {
    globalThis.__SFPS_EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  }
  return globalThis.__SFPS_EPHEMERAL_SESSION_SECRET;
}

function key() {
  return crypto.createHash("sha256").update(sessionSecret()).digest();
}

function encodeSession(user) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const payload = JSON.stringify({
    user: (() => {
      const { password_hash, ...safe } = user || {};
      return safe;
    })(),
    exp: Date.now() + TTL,
  });

  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decodeSession(token) {
  try {
    const [ivPart, tagPart, encryptedPart] = String(token || "").split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivPart, "base64url")
    );

    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    const payload = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]);

    const data = JSON.parse(payload.toString("utf8"));
    if (!data?.user || Number(data.exp) <= Date.now()) return null;

    return data.user;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function auth(req, res, next) {
  const token = readCookie(req, COOKIE);
  const user = token ? decodeSession(token) : null;

  if (user) {
    req.user = user;
    req.sessionToken = token;
    return next();
  }

  return res.status(401).json({ error: "Authentication required." });
}

function allow(...roles) {
  const set = new Set(roles.flat().map((x) => String(x).toLowerCase()));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!set.size || set.has(String(req.user.role).toLowerCase())) {
      return next();
    }

    return res.status(403).json({
      error: "You do not have permission for this action.",
    });
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (!["owner", "sub-owner", "manager"].includes(String(req.user.role).toLowerCase())) {
    return res.status(403).json({
      error: "Administrator permission is required.",
    });
  }

  next();
}

function isAjeet(req) {
  return String(req.user?.uid || "").toLowerCase() === "ajeet@sir";
}

function isOwnerAdmin(req) {
  return (
    ["owner@principle", "owner@director"].includes(
      String(req.user?.uid || "").toLowerCase()
    ) &&
    ["owner", "sub-owner"].includes(String(req.user?.role || "").toLowerCase())
  );
}

function titleFromUid(uid) {
  const suffix = String(uid || "").split("@")[1]?.toLowerCase();
  return suffix === "sir" ? "Sir" : suffix === "mam" ? "Mam" : suffix === "miss" ? "Miss" : "";
}

function displayName(user) {
  if (!user) return "";
  const title = titleFromUid(user.uid);
  const clean = String(user.name || "").replace(/\s+(Sir|Mam|Miss)$/i, "").trim();
  return title ? `${clean} ${title}` : clean;
}

function specialSeatPlannerAccess(req) {
  return (
    (isAjeet(req) || isOwnerAdmin(req)) &&
    db.setting("seat_planning_enabled", "true") === "true"
  );
}

function teacherScope(req, classId) {
  return Promise.resolve(db.canTeach(req.user, classId));
}

function loginCookie(res, user) {
  const token = encodeSession(user);
  const secure = process.env.NODE_ENV === "production" || process.env.NETLIFY === "true";
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(TTL / 1000)}`,
  ];

  if (secure) parts.push("Secure");

  res.setHeader("Set-Cookie", parts.join("; "));
  return token;
}

function logout(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" || process.env.NETLIFY === "true" ? "; Secure" : ""}`
  );
}

const requireOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (
    !["owner@principle", "owner@director"].includes(
      String(req.user.uid).toLowerCase()
    ) ||
    !["owner", "sub-owner"].includes(req.user.role)
  ) {
    return res.status(403).json({
      error: "Owner-level permission is required.",
    });
  }

  next();
};

module.exports = {
  auth,
  allow,
  requireOwner,
  requireAdmin,
  isAjeet,
  isOwnerAdmin,
  specialSeatPlannerAccess,
  teacherScope,
  loginCookie,
  logout,
  titleFromUid,
  displayName,
};
