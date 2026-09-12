/*
 * SFPS fast tab helper.
 * The main dashboard uses data-page navigation in dashboard.js.
 * This helper only handles pages that explicitly opt into data-tab,
 * so it cannot hijack the existing Attendance/Syllabus/etc. buttons.
 */
(() => {
  function activate(tab) {
    const target = tab?.dataset?.tab;
    if (!target) return;
    document.querySelectorAll("[data-tab]").forEach(x => {
      x.classList.toggle("active", x === tab);
      x.setAttribute("aria-selected", x === tab ? "true" : "false");
    });
    document.querySelectorAll("[data-tab-panel]").forEach(panel => {
      panel.hidden = panel.dataset.tabPanel !== target;
    });
    window.dispatchEvent(new CustomEvent("sfps:tabchange", {detail:{tab:target}}));
  }
  document.addEventListener("click", e => {
    const tab=e.target.closest("[data-tab]");
    if(!tab) return;
    e.preventDefault();
    activate(tab);
  });
  window.SFPSFastTabs={activate};
})();
