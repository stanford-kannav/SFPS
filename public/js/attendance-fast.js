(() => {
  async function getJSON(url, options) {
    const r = await fetch(url, { credentials:"include", ...options });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  }

  async function loadAttendance(rootEl) {
    if (!rootEl) return;
    rootEl.innerHTML = `
      <div class="module-card">
        <div class="module-head"><div><h2>Attendance</h2><p>Fast attendance register</p></div>
        <button class="attendance-refresh">Refresh</button></div>
        <div class="attendance-body"><div class="loading-line">Loading…</div></div>
      </div>`;

    const body = rootEl.querySelector(".attendance-body");
    try {
      let data;
      const endpoints = ["/api/academic/attendance?date="+new Date().toISOString().slice(0,10)];
      for (const url of endpoints) {
        try { data = await getJSON(url); break; } catch (_) {}
      }
      if (!data) throw new Error("Attendance service is unavailable.");

      const rows = data.records || data.attendance || data.students || [];
      if (!rows.length) {
        body.innerHTML = `<div class="empty-state">No attendance records for today.</div>`;
      } else {
        body.innerHTML = `<div class="responsive-table"><table><thead><tr><th>Student</th><th>Class</th><th>Status</th></tr></thead><tbody>${
          rows.map(x => `<tr><td>${x.student_name || x.name || x.uid || ""}</td><td>${x.class_name || x.class || ""}</td><td>${x.status || "—"}</td></tr>`).join("")
        }</tbody></table></div>`;
      }
      rootEl.querySelector(".attendance-refresh").onclick = () => loadAttendance(rootEl);
    } catch (e) {
      body.innerHTML = `<div class="empty-state error-state">${e.message}</div>`;
      rootEl.querySelector(".attendance-refresh").onclick = () => loadAttendance(rootEl);
    }
  }

  window.SFPSLoadAttendance = loadAttendance;

  async function tryAutomaticTeacherAttendance() {
    try {
      const me = await getJSON("/api/auth/me");
      const role = String(me.user?.role || "").toLowerCase();
      if (role !== "teacher" && role !== "manager") return;
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          const result = await getJSON("/api/academic/teacher-registry/auto-check-in", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy})
          });
          window.dispatchEvent(new CustomEvent("sfps:teacher-auto-attendance",{detail:result}));
        } catch (_) {}
      }, () => {}, {enableHighAccuracy:true,timeout:10000,maximumAge:60000});
    } catch (_) {}
  }
  window.SFPSTryAutomaticTeacherAttendance = tryAutomaticTeacherAttendance;
  document.addEventListener("DOMContentLoaded", () => setTimeout(tryAutomaticTeacherAttendance, 700));

})();
