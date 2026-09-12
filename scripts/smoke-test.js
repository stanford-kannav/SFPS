const fs = require("fs");
const path = require("path");
const db = require("../src/db/database");

const root = path.join(__dirname, "..");

const requiredFiles = [
  "src/server.js",
  "src/app.js",
  "src/middleware/auth.js",
  "src/db/database.js",
  "src/routes/auth.js",
  "src/routes/academic.js",
  "src/routes/teachers.js",
  "src/routes/students.js",
  "src/routes/seatPlanner.js",
  "src/routes/developer-console.js",
  "src/routes/yt.js",
  "render.yaml",
  "public/index.html",
  "public/dashboard.html",
  "public/login.html",
  "public/js/dashboard.js",
  "public/js/login.js",
  "public/css/ui-clean-v14.css",
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

db.init();

const expected = [
  "LKG", "NUR", "UKG", "1", "2", "3", "4",
  "5", "6", "7", "8", "9", "10",
];

const actual = db
  .findAll("classes")
  .sort((a, b) => a.id - b.id)
  .map((x) => x.name);

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Invalid class list: ${actual.join(",")}`);
}

for (const uid of [
  "owner@principle",
  "owner@director",
  "ajeet@sir",
  "ashish@sir",
]) {
  if (!db.findOne("users", (u) => String(u.uid).toLowerCase() === uid)) {
    throw new Error(`Missing required user: ${uid}`);
  }
}

if (
  !db.findOne("seat_planner_access", (x) => {
    const u = db.findOne("users", (u) => u.id === x.teacher_id);
    return u?.uid === "ajeet@sir" && x.enabled !== false;
  })
) {
  throw new Error("Ajeet Sir Seat Planning access is not seeded");
}

const dashboard = fs.readFileSync(
  path.join(root, "public/js/dashboard.js"),
  "utf8"
);

for (const fn of [
  "dashboard",
  "students",
  "teachers",
  "attendance",
  "syllabus",
  "teacherDiary",
  "headTeach",
  "attendanceControl",
  "results",
  "fees",
  "parentAccounts",
  "parentIds",
  "openParentCreateModal",
  "submitParentCreate",
  "seatPlanner",
  "developerConsole",
  "parentNotices",
  "ratings",
  "ytPage",
  "saveDiary",
  "saveSyllabusPlan",
  "saveMyTeachingClasses",
]) {
  if (!dashboard.includes(`function ${fn}`) &&
      !dashboard.includes(`async function ${fn}`)) {
    throw new Error(`Missing UI function: ${fn}`);
  }
}

// Search only source text, not binary assets.
const forbidden = [
  "better-sqlite3",
  "jsonwebtoken",
  "db.prepare(",
  "db.exec(",
  "JWT_SECRET",
  "NETLIFY_DEPLOYMENT",
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of [
  ...walk(path.join(root, "src")),
  ...walk(path.join(root, "public")),
]) {
  if (!/\.(js|html|json|css)$/i.test(file)) continue;

  const text = fs.readFileSync(file, "utf8");

  for (const term of forbidden) {
    if (text.includes(term)) {
      throw new Error(
        `Forbidden legacy reference ${term} in ${path.relative(root, file)}`
      );
    }
  }
}

for (const file of walk(path.join(root, "public"))) {
  if (!/\.(js|html|css)$/i.test(file)) continue;

  const text = fs.readFileSync(file, "utf8");

  for (const id of [
    "owner@principle",
    "owner@director",
    "ajeet@sir",
    "ashish@sir",
  ]) {
    if (text.includes(id)) {
      throw new Error(
        `Protected staff ID leaked into frontend/UI: ${id} in ${path.relative(root, file)}`
      );
    }
  }
}

for (const table of db.TABLES) {
  const rows = db.readTable(table);
  if (!Array.isArray(rows)) {
    throw new Error(`Table ${table} is not an array`);
  }
}

const yt = fs.readFileSync(
  path.join(root, "src/routes/yt.js"),
  "utf8"
);

if (!yt.includes("@google/genai") || !yt.includes("GEMINI_API_KEY")) {
  throw new Error("Gemini-only YT integration is missing.");
}

const htmlFiles = walk(path.join(root, "public")).filter((f) =>
  f.endsWith(".html")
);

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");

  for (const url of [
    ...html.matchAll(/(?:src|href)="(\/[^"]+)"/g),
  ]) {
    const target = url[1].split("?")[0].split("#")[0];
    if (!target || target.startsWith("/api/")) continue;

    const local = path.join(root, "public", target.replace(/^\//, ""));
    if (!fs.existsSync(local)) {
      throw new Error(
        `Missing frontend asset ${target} referenced by ${path.relative(root, file)}`
      );
    }
  }
}

console.log("SFPS smoke test passed.");
console.log(`Classes: ${actual.length}`);
console.log(`Users: ${db.findAll("users").length}`);
console.log("Database: JSON/XML/YAML");
console.log("AI provider: Gemini only");
console.log("Deployment: Render Node.js Web Service + persistent disk");
