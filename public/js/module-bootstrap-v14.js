document.addEventListener("DOMContentLoaded", () => {
  const attendancePanel = document.querySelector('[data-tab-panel="attendance"], #attendanceTab, #attendance-panel');
  const ytPanel = document.querySelector('[data-tab-panel="yt"], #ytTab, #yt-panel, #yourTeacherTab');
  if (attendancePanel && window.SFPSLoadAttendance) {
    window.addEventListener("sfps:tabchange", e => {
      if (String(e.detail.tab).toLowerCase().includes("attendance")) window.SFPSLoadAttendance(attendancePanel);
    });
  }
  if (ytPanel && window.SFPSInitYT) {
    window.addEventListener("sfps:tabchange", e => {
      const t = String(e.detail.tab).toLowerCase();
      if (t === "yt" || t.includes("your") || t.includes("teacher")) window.SFPSInitYT(ytPanel);
    });
  }
});
