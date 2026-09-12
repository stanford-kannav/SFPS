const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const required = [
  "package.json", ".gitignore", ".env.example", ".nvmrc", ".node-version", "render.yaml",
  "src/app.js", "src/server.js", "src/storage.js", "src/db/database.js",
  "src/routes/auth.js", "src/routes/yt.js",
  "public/index.html", "public/login.html", "public/js/login.js",
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}

const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f); else files.push(f);
  }
}
for (const dir of ["src", "public/js", "scripts"]) walk(path.join(root, dir));
for (const file of files.filter(x => x.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

execFileSync(process.execPath, [path.join(root, "scripts", "smoke-test.js")], { stdio: "inherit" });
console.log("SFPS Render verification complete.");
