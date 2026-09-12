(async () => {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (!response.ok) return;
  const data = await response.json();
  const user = data.user || data;
  const displayName = user.display_name || user.name || "U";
  const initials = displayName
    .split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();

  ["profileAvatar","profileButtonAvatar"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });

  [["profileName", displayName],
   ["profileRole", user.role], ["profileButtonName", displayName],
   ["profileButtonRole", user.role]].forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "";
  });

  const button = document.getElementById("profileButton");
  const menu = document.getElementById("profileMenu");
  if (button && menu) {
    button.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", e => {
      if (!menu.contains(e.target) && !button.contains(e.target)) menu.hidden = true;
    });
  }

  const logout = document.getElementById("profileLogout");
  if (logout) {
    logout.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method:"POST", credentials:"include" });
      location.href = "/login.html";
    });
  }
})();
