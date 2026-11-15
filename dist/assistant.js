(() => {
  const SUGGESTIONS = [
    'Who needs review?',
    'How do I stand someone down?',
    'How does coverage work?',
    'Where is Crew health?'
  ];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function formatReply(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function readAppContext() {
    const context = {
      view: document.body?.dataset?.view || 'overview',
      selected: null,
      crew: []
    };
    try {
      const saved = JSON.parse(localStorage.getItem('crew-swap-ui-v1') || 'null');
      if (saved?.crew?.length) {
        context.crew = saved.crew.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          state: c.state,
          sleep: c.sleep,
          fatigue: c.fatigue,
          skills: c.skills
        }));
        context.selected = saved.selected || null;
      }
    } catch {
      /* ignore corrupt local state */
    }
    return context;
  }

  function mount() {
    const root = document.createElement('div');
    root.className = 'assistant';
    root.innerHTML = `
      <button type="button" class="assistant-fab" id="assistant-open" aria-expanded="false" aria-controls="assistant-panel">
        <span class="assistant-fab__mark" aria-hidden="true"></span>
        <span class="assistant-fab__label">Ask assistant</span>
      </button>
      <section class="assistant-panel" id="assistant-panel" hidden aria-labelledby="assistant-title">
        <header class="assistant-panel__head">
          <div>
            <p class="assistant-panel__eyebrow">Mission console</p>
            <h2 id="assistant-title">Mission assistant</h2>
          </div>
          <div class="assistant-panel__meta">
            <span class="assistant-mode" id="assistant-mode">Checking…</span>
            <button type="button" class="assistant-close" id="assistant-close" aria-label="Close assistant">×</button>
          </div>
        </header>
        <div class="assistant-messages" id="assistant-messages" role="log" aria-live="polite"></div>
        <div class="assistant-suggestions" id="assistant-suggestions"></div>
        <form class="assistant-composer" id="assistant-form">
          <label class="visually-hidden" for="assistant-input">Message</label>
          <textarea id="assistant-input" rows="1" placeholder="Ask about sleep, stand-down, coverage…" maxlength="2000"></textarea>
          <button type="submit" class="assistant-send" id="assistant-send" aria-label="Send message">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 13V3.5M3.8 7.5 8 3.3l4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </form>
      </section>
    `;
    document.body.appendChild(root);

    const openBtn = root.querySelector('#assistant-open');
    const closeBtn = root.querySelector('#assistant-close');
    const panel = root.querySelector('#assistant-panel');
    const messages = root.querySelector('#assistant-messages');
    const suggestions = root.querySelector('#assistant-suggestions');
    const form = root.querySelector('#assistant-form');
    const input = root.querySelector('#assistant-input');
    const sendBtn = root.querySelector('#assistant-send');
    const modeEl = root.querySelector('#assistant-mode');

    const history = [];
    let busy = false;
    let mode = 'fallback';

    function setOpen(open) {
      panel.hidden = !open;
      openBtn.setAttribute('aria-expanded', String(open));
      openBtn.classList.toggle('is-open', open);
      root.classList.toggle('is-open', open);
      if (open) {
        input.focus();
      }
    }

    function appendMessage(role, text, extra) {
      const row = document.createElement('div');
      row.className = `assistant-msg assistant-msg--${role}`;
      if (role === 'assistant') {
        row.innerHTML = `<span class="assistant-msg__av" aria-hidden="true"></span><div class="assistant-msg__bubble">${formatReply(text)}</div>`;
      } else {
        row.innerHTML = `<div class="assistant-msg__bubble">${escapeHtml(text)}</div>`;
      }
      if (extra) {
        const note = document.createElement('p');
        note.className = 'assistant-msg__note';
        note.textContent = extra;
        row.querySelector('.assistant-msg__bubble').appendChild(note);
      }
      messages.appendChild(row);
      messages.scrollTop = messages.scrollHeight;
      return row;
    }

    function setTyping(on) {
      let typing = messages.querySelector('.assistant-typing');
      if (on && !typing) {
        typing = document.createElement('div');
        typing.className = 'assistant-msg assistant-msg--assistant assistant-typing';
        typing.innerHTML = '<span class="assistant-msg__av" aria-hidden="true"></span><div class="assistant-msg__bubble"><span class="assistant-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="visually-hidden">Assistant is typing</span></div>';
        messages.appendChild(typing);
        messages.scrollTop = messages.scrollHeight;
      } else if (!on && typing) {
        typing.remove();
      }
    }

    function renderSuggestions() {
      suggestions.innerHTML = SUGGESTIONS.map(
        (label) => `<button type="button" class="assistant-chip" data-prompt="${escapeHtml(label)}">${escapeHtml(label)}</button>`
      ).join('');
    }

    function updateModeLabel() {
      modeEl.textContent = mode === 'live' ? 'Live AI' : 'Offline demo';
      modeEl.dataset.mode = mode;
    }

    async function refreshStatus() {
      try {
        const response = await fetch('/api/chat');
        if (!response.ok) throw new Error('status failed');
        const data = await response.json();
        mode = data.mode === 'live' ? 'live' : 'fallback';
      } catch {
        mode = 'fallback';
      }
      updateModeLabel();
    }

    async function sendMessage(raw) {
      const text = String(raw || '').trim();
      if (!text || busy) return;
      busy = true;
      sendBtn.disabled = true;
      appendMessage('user', text);
      history.push({ role: 'user', content: text });
      input.value = '';
      resizeInput();
      setTyping(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: history.slice(0, -1),
            context: readAppContext()
          })
        });
        const data = await response.json().catch(() => ({}));
        setTyping(false);
        if (!response.ok) {
          appendMessage('assistant', data.error || 'The assistant could not answer just now. Try again in a moment.');
        } else {
          mode = data.mode === 'live' ? 'live' : 'fallback';
          updateModeLabel();
          const reply = data.reply || 'No reply returned.';
          history.push({ role: 'assistant', content: reply });
          appendMessage('assistant', reply, data.notice || null);
        }
      } catch {
        setTyping(false);
        appendMessage(
          'assistant',
          'I could not reach the local assistant endpoint. Keep the Crew Swap server running (`npm start`) and try again.'
        );
      } finally {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }

    function resizeInput() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    openBtn.addEventListener('click', () => setOpen(panel.hidden));
    closeBtn.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) setOpen(false);
    });

    suggestions.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-prompt]');
      if (chip) sendMessage(chip.dataset.prompt);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      sendMessage(input.value);
    });

    input.addEventListener('input', resizeInput);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage(input.value);
      }
    });

    renderSuggestions();
    appendMessage(
      'assistant',
      'Ready to help with sleep/fatigue check-ins, stand-down decisions, coverage, and console navigation. Ask in plain language or tap a prompt below.'
    );
    refreshStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
