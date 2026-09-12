(() => {
  async function sendMessage(input, messagesEl, sendBtn) {
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    messagesEl.insertAdjacentHTML("beforeend", `<div class="yt-msg user">${escapeHTML(message)}</div>`);
    sendBtn.disabled = true;
    const thinking = document.createElement("div");
    thinking.className = "yt-msg assistant thinking";
    thinking.textContent = "Thinking…";
    messagesEl.appendChild(thinking);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const r = await fetch("/api/yt/chat", {
        method:"POST",
        credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ message })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `YT request failed (${r.status})`);
      thinking.classList.remove("thinking");
      thinking.textContent = d.reply || d.text || d.output || "YT could not produce a response.";
    } catch (e) {
      thinking.classList.remove("thinking");
      thinking.classList.add("error-state");
      thinking.textContent = e.message;
    } finally {
      sendBtn.disabled = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function init(rootEl) {
    if (!rootEl || rootEl.dataset.ytReady === "1") return;
    rootEl.dataset.ytReady = "1";
    rootEl.innerHTML = `
      <div class="yt-card">
        <div class="yt-title"><div class="yt-avatar">YT</div><div><h2>Your Teacher</h2><p>Ask YT anything about your school work.</p></div></div>
        <div class="yt-messages"></div>
        <form class="yt-form"><input class="yt-input" autocomplete="off" placeholder="Ask Your Teacher…"><button>Send</button></form>
      </div>`;
    const form = rootEl.querySelector(".yt-form");
    const input = rootEl.querySelector(".yt-input");
    const messages = rootEl.querySelector(".yt-messages");
    const button = form.querySelector("button");
    form.addEventListener("submit", e => { e.preventDefault(); sendMessage(input, messages, button); });
    messages.insertAdjacentHTML("beforeend", `<div class="yt-msg assistant">Hello! I’m YT — Your Teacher. How can I help?</div>`);
  }

  window.SFPSInitYT = init;
})();
