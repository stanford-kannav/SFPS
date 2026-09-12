(() => {
  const panel = document.createElement('section');
  panel.className = 'yt-panel';
  panel.setAttribute('aria-label', 'YT Your Teacher AI assistant');
  panel.innerHTML = `
    <div class="yt-head">
      <div class="yt-avatar">YT</div>
      <div class="yt-title"><strong>YT</strong><span>Your Teacher</span></div>
      <button class="yt-close" type="button" aria-label="Close YT">×</button>
    </div>
    <div class="yt-status"><span></span><span id="ytStatusText">Checking AI…</span></div>
    <div class="yt-messages" id="ytMessages">
      <div class="yt-msg yt-bot"><div>Hi! I’m <b>YT — Your Teacher</b>. How can I help you today?</div></div>
    </div>
    <div class="yt-suggestions">
      <button type="button">Explain something</button>
      <button type="button">Help me study</button>
      <button type="button">How do I use SFPS?</button>
    </div>
    <form class="yt-form" id="ytForm">
      <textarea id="ytInput" rows="1" maxlength="4000" placeholder="Ask YT anything…" aria-label="Message YT"></textarea>
      <button class="yt-mic" id="ytMic" type="button" title="Voice input">🎙</button>
      <button class="yt-send" type="submit" title="Send">➤</button>
    </form>
    <div class="yt-foot">AI can make mistakes. Verify important school information.</div>`;
  document.body.appendChild(panel);

  const launcher = document.createElement('button');
  launcher.className = 'yt-launcher';
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open YT Your Teacher');
  launcher.innerHTML = '<span class="yt-launcher-mark">YT</span><span class="yt-launcher-text">Your Teacher</span>';
  document.body.appendChild(launcher);

  const messages = panel.querySelector('#ytMessages');
  const input = panel.querySelector('#ytInput');
  const form = panel.querySelector('#ytForm');
  const statusText = panel.querySelector('#ytStatusText');
  const close = panel.querySelector('.yt-close');
  const mic = panel.querySelector('#ytMic');
  let history = [];
  let busy = false;

  function open() { panel.classList.add('open'); setTimeout(() => input.focus(), 50); }
  function hide() { panel.classList.remove('open'); }
  window.SFPSOpenYT = open;
  window.SFPSCloseYT = hide;
  launcher.addEventListener('click', open);
  close.addEventListener('click', hide);

  function addMessage(role, text) {
    const item = document.createElement('div');
    item.className = `yt-msg ${role === 'user' ? 'yt-user' : 'yt-bot'}`;
    const bubble = document.createElement('div');
    bubble.textContent = text;
    item.appendChild(bubble);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function setStatus(text, online = true) {
    statusText.textContent = text;
    const dot = panel.querySelector('.yt-status span');
    dot.classList.toggle('offline', !online);
  }

  async function checkStatus() {
    try {
      const r = await fetch('/api/yt/status', { credentials: 'same-origin' });
      const data = await r.json();
      if (data.available) setStatus('YT online');
      else setStatus('YT not configured', false);
    } catch { setStatus('YT unavailable', false); }
  }
  checkStatus();

  async function send(text) {
    if (busy || !text.trim()) return;
    const message = text.trim();
    addMessage('user', message);
    input.value = '';
    busy = true;
    setStatus('YT is thinking…');
    const typing = document.createElement('div');
    typing.className = 'yt-msg yt-bot yt-typing';
    typing.innerHTML = '<div>Thinking<span>•••</span></div>';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    try {
      const r = await fetch('/api/yt/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message, history })
      });
      const data = await r.json();
      typing.remove();
      if (!r.ok) throw new Error(data.error || 'YT request failed');
      addMessage('assistant', data.reply);
      history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply });
      history = history.slice(-12);
      setStatus('YT online');
    } catch (error) {
      typing.remove();
      addMessage('assistant', error.message || 'Sorry, YT is unavailable right now.');
      setStatus('YT unavailable', false);
    } finally {
      busy = false;
      input.focus();
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  panel.querySelectorAll('.yt-suggestions button').forEach(btn => btn.addEventListener('click', () => send(btn.textContent)));

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    mic.addEventListener('click', () => {
      const recognition = new SpeechRecognition();
      recognition.lang = document.documentElement.lang || 'en-IN';
      recognition.interimResults = false;
      mic.classList.add('recording');
      recognition.onresult = e => { input.value = e.results[0][0].transcript; input.focus(); };
      recognition.onerror = () => {};
      recognition.onend = () => mic.classList.remove('recording');
      recognition.start();
    });
  } else {
    mic.style.display = 'none';
  }
})();
