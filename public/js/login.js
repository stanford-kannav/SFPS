const $ = (id) => document.getElementById(id);
let classes = [];
let accountLookupTimer = null;
let submitting = false;

async function responseData(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: `Server returned HTTP ${response.status}.` }; }
}

async function loadClasses() {
  try {
    const r = await fetch("/api/auth/classes", { credentials: "same-origin", cache: "no-store" });
    const d = await responseData(r);
    if (!r.ok) throw new Error(d.error || "Unable to load classes.");
    const order = { LKG:1, NUR:2, UKG:3, "1":4, "2":5, "3":6, "4":7, "5":8, "6":9, "7":10, "8":11, "9":12, "10":13 };
    classes = (d.classes || []).sort((a,b) => (order[a.name] || 99) - (order[b.name] || 99));
    const s = $("loginClass");
    if (s) s.innerHTML = '<option value="">Select class</option>' + classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  } catch (error) {
    console.error(error);
  }
}

function setLoginClass(show) {
  const w = $("loginClassWrap"), s = $("loginClass");
  if (!w || !s) return;
  w.hidden = !show;
  s.required = show;
  if (!show) s.value = "";
}

async function detectAccountType() {
  const uid = String($("uid")?.value || "").trim();
  clearTimeout(accountLookupTimer);
  if (!uid) { setLoginClass(false); return; }
  accountLookupTimer = setTimeout(async () => {
    try {
      const r = await fetch("/api/auth/account-type?uid=" + encodeURIComponent(uid), { credentials: "same-origin", cache: "no-store" });
      const d = await responseData(r);
      setLoginClass(d.role === "student");
    } catch { setLoginClass(false); }
  }, 120);
}

$("uid")?.addEventListener("input", detectAccountType);
$("uid")?.addEventListener("blur", detectAccountType);

$("loginForm").onsubmit = async (event) => {
  event.preventDefault();
  if (submitting) return;

  const uid = String($("uid")?.value || "").trim();
  const password = String($("password")?.value || "");
  const classWrap = $("loginClassWrap");
  const classSelect = $("loginClass");
  const classId = classWrap?.hidden ? 0 : Number(classSelect?.value || 0);

  if (!uid || !password) {
    $("loginMsg").textContent = !uid && !password ? "User ID and password are required." : !uid ? "User ID is required." : "Password is required.";
    return;
  }
  if (!classWrap?.hidden && !classId) {
    $("loginMsg").textContent = "Please select your class.";
    return;
  }

  submitting = true;
  const button = $("loginForm").querySelector("button[type=submit]");
  if (button) { button.disabled = true; button.textContent = "Signing in…"; }
  $("loginMsg").textContent = "Checking…";

  try {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ uid, password, classId }),
    });
    const d = await responseData(r);
    if (!r.ok) {
      $("loginMsg").textContent = d.error || "Login failed.";
      return;
    }
    window.location.assign("/dashboard.html");
  } catch (error) {
    console.error(error);
    $("loginMsg").textContent = "Unable to connect to SFPS.";
  } finally {
    submitting = false;
    if (button) { button.disabled = false; button.textContent = "Verify & Sign In"; }
  }
};

loadClasses().then(() => setLoginClass(false));
