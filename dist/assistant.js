(() => {
  const STORAGE_KEYS = ['crew-swap-ui-v2', 'crew-swap-ui-v1'];
  const CHAT_KEY = 'crew-swap-chat-v1';
  const STARTERS = [
    'Who needs review?',
    'How do I stand someone down?',
    'How does coverage work?',
    'What should I do next?'
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
      assigned: null,
      requirements: null,
      crew: []
    };
    for (const key of STORAGE_KEYS) {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (!saved?.crew?.length) continue;
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
        context.assigned = saved.assigned || null;
        context.requirements = saved.requirements || null;
        break;
      } catch {
        /* ignore corrupt local state */
      }
    }
    return context;
  }

  function loadChat() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || 'null');
      if (saved && Array.isArray(saved.messages)) return saved;
    } catch {
      /* ignore */
    }
    return { messages: [], mode: 'local' };
  }

  function saveChat(state) {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify({
        messages: state.messages.slice(-40),
        mode: state.mode
      }));
    } catch {
      /* ignore quota */
    }
  }

  function mount() {
    const root = document.createElement('div');
    root.className = 'assistant';
    root.innerHTML = `
      <button type="button" class="assistant-fab" id="assistant-open" aria-expanded="false" aria-controls="assistant-panel">
        <span class="assistant-fab__mark" aria-hidden="true"></span>
        <span class="assistant-fab__label">Mission chat</span>
      </button>
      <section class="assistant-panel" id="assistant-panel" hidden aria-labelledby="assistant-title">
        <header class="assistant-panel__head">
          <div>
            <p class="assistant-panel__eyebrow">Live thread</p>
            <h2 id="assistant-title">Mission chat</h2>
          </div>
          <div class="assistant-panel__meta">
            <span class="assistant-mode" id="assistant-mode">Checking…</span>
            <button type="button" class="assistant-icon-btn" id="assistant-clear" title="New chat" aria-label="Start a new chat">↻</button>
            <button type="button" class="assistant-close" id="assistant-close" aria-label="Close chat">×</button>
          </div>
        </header>
        <div class="assistant-messages" id="assistant-messages" role="log" aria-live="polite"></div>
        <div class="assistant-suggestions" id="assistant-suggestions"></div>
        <form class="assistant-composer" id="assistant-form">
          <label class="visually-hidden" for="assistant-input">Message</label>
          <textarea id="assistant-input" rows="1" placeholder="Message the mission assistant…" maxlength="2000"></textarea>
          <button type="submit" class="assistant-send" id="assistant-send" aria-label="Send message">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 13V3.5M3.8 7.5 8 3.3l4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </form>
      </section>
    `;
    document.body.appendChild(root);

    const openBtn = root.querySelector('#assistant-open');
    const closeBtn = root.querySelector('#assistant-close');
    const clearBtn = root.querySelector('#assistant-clear');
    const panel = root.querySelector('#assistant-panel');
    const messagesEl = root.querySelector('#assistant-messages');
    const suggestions = root.querySelector('#assistant-suggestions');
    const form = root.querySelector('#assistant-form');
    const input = root.querySelector('#assistant-input');
    const sendBtn = root.querySelector('#assistant-send');
    const modeEl = root.querySelector('#assistant-mode');

    const chat = loadChat();
    let busy = false;
    let mode = chat.mode || 'local';

    function setOpen(open) {
      panel.hidden = !open;
      openBtn.setAttribute('aria-expanded', String(open));
      openBtn.classList.toggle('is-open', open);
      root.classList.toggle('is-open', open);
      if (open) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
        input.focus();
      }
    }

    function updateModeLabel(notice) {
      const label = mode === 'live' ? 'Live AI' : 'Local chat';
      modeEl.textContent = label;
      modeEl.dataset.mode = mode === 'live' ? 'live' : 'fallback';
      modeEl.title = notice || label;
    }

    function renderSuggestions(list) {
      const userTurns = chat.messages.filter((m) => m.role === 'user').length;
      const chips = list && list.length ? list : userTurns ? [] : STARTERS;
      if (!chips.length) {
        suggestions.innerHTML = '';
        suggestions.hidden = true;
        return;
      }
      suggestions.hidden = false;
      suggestions.innerHTML = chips
        .slice(0, 4)
        .map((label) => `<button type="button" class="assistant-chip" data-prompt="${escapeHtml(label)}">${escapeHtml(label)}</button>`)
        .join('');
    }

    function paintMessages() {
      messagesEl.innerHTML = '';
      if (!chat.messages.length) {
        appendMessage(
          'assistant',
          'This is a live chat thread for the mission console. Ask about the current crew, stand-down, coverage, or what to click next — follow-ups stay in context.'
        );
      } else {
        for (const turn of chat.messages) {
          appendMessage(turn.role, turn.content, turn.notice, true);
        }
      }
      renderSuggestions();
      updateModeLabel();
    }

    function appendMessage(role, text, notice, skipScroll) {
      const row = document.createElement('div');
      row.className = `assistant-msg assistant-msg--${role}`;
      if (role === 'assistant') {
        row.innerHTML = `<span class="assistant-msg__av" aria-hidden="true"></span><div class="assistant-msg__bubble">${formatReply(text)}</div>`;
      } else {
        row.innerHTML = `<div class="assistant-msg__bubble">${escapeHtml(text)}</div>`;
      }
      if (notice) {
        const note = document.createElement('p');
        note.className = 'assistant-msg__note';
        note.textContent = notice;
        row.querySelector('.assistant-msg__bubble').appendChild(note);
      }
      messagesEl.appendChild(row);
      if (!skipScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
      return row;
    }

    function startAssistantBubble() {
      const row = document.createElement('div');
      row.className = 'assistant-msg assistant-msg--assistant';
      row.innerHTML = '<span class="assistant-msg__av" aria-hidden="true"></span><div class="assistant-msg__bubble"><span class="assistant-stream"></span></div>';
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return {
        row,
        bubble: row.querySelector('.assistant-msg__bubble'),
        stream: row.querySelector('.assistant-stream'),
        setText(text) {
          this.stream.innerHTML = formatReply(text);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        },
        setNotice(notice) {
          let note = this.bubble.querySelector('.assistant-msg__note');
          if (!notice) {
            note?.remove();
            return;
          }
          if (!note) {
            note = document.createElement('p');
            note.className = 'assistant-msg__note';
            this.bubble.appendChild(note);
          }
          note.textContent = notice;
        }
      };
    }

    function setTyping(on) {
      let typing = messagesEl.querySelector('.assistant-typing');
      if (on && !typing) {
        typing = document.createElement('div');
        typing.className = 'assistant-msg assistant-msg--assistant assistant-typing';
        typing.innerHTML =
          '<span class="assistant-msg__av" aria-hidden="true"></span><div class="assistant-msg__bubble"><span class="assistant-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="visually-hidden">Assistant is typing</span></div>';
        messagesEl.appendChild(typing);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (!on && typing) {
        typing.remove();
      }
    }

    async function refreshStatus() {
      try {
        const response = await fetch('/api/chat');
        if (!response.ok) throw new Error('status failed');
        const data = await response.json();
        mode = data.mode === 'live' ? 'live' : 'local';
      } catch {
        mode = 'local';
      }
      chat.mode = mode;
      updateModeLabel();
      saveChat(chat);
    }

    async function sendMessage(raw) {
      const text = String(raw || '').trim();
      if (!text || busy) return;
      busy = true;
      sendBtn.disabled = true;

      chat.messages.push({ role: 'user', content: text });
      appendMessage('user', text);
      saveChat(chat);
      input.value = '';
      resizeInput();
      renderSuggestions([]);
      setTyping(true);

      const history = chat.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      let replyText = '';
      let notice = '';
      let followUps = [];
      let bubble = null;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({
            message: text,
            history,
            context: readAppContext(),
            stream: true
          })
        });

        if (!response.ok) {
          setTyping(false);
          const data = await response.json().catch(() => ({}));
          replyText = data.error || 'The assistant could not answer just now. Try again in a moment.';
          chat.messages.push({ role: 'assistant', content: replyText });
          appendMessage('assistant', replyText);
        } else if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
          setTyping(false);
          bubble = startAssistantBubble();
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || '';
            for (const chunk of chunks) {
              const line = chunk.split('\n').find((part) => part.startsWith('data:'));
              if (!line) continue;
              let event;
              try {
                event = JSON.parse(line.slice(5).trim());
              } catch {
                continue;
              }
              if (event.type === 'meta') {
                mode = event.mode === 'live' ? 'live' : 'local';
                notice = event.notice || notice;
                updateModeLabel(notice);
                if (notice) bubble.setNotice(notice);
              } else if (event.type === 'token') {
                replyText += event.text || '';
                bubble.setText(replyText);
              } else if (event.type === 'done') {
                mode = event.mode === 'live' ? 'live' : mode;
                followUps = Array.isArray(event.followUps) ? event.followUps : [];
                updateModeLabel(notice);
              } else if (event.type === 'error') {
                if (!replyText) replyText = event.error || 'Chat failed.';
                bubble.setText(replyText);
              }
            }
          }

          if (!replyText) {
            replyText = 'No reply returned.';
            bubble.setText(replyText);
          }
          if (notice) bubble.setNotice(notice);
          chat.messages.push({ role: 'assistant', content: replyText, notice: notice || undefined });
        } else {
          setTyping(false);
          const data = await response.json().catch(() => ({}));
          mode = data.mode === 'live' ? 'live' : 'local';
          replyText = data.reply || 'No reply returned.';
          notice = data.notice || '';
          followUps = Array.isArray(data.followUps) ? data.followUps : [];
          chat.messages.push({ role: 'assistant', content: replyText, notice: notice || undefined });
          appendMessage('assistant', replyText, notice || null);
          updateModeLabel(notice);
        }
      } catch {
        setTyping(false);
        replyText =
          'I could not reach the local chat endpoint. Keep the Crew Swap server running (`npm start`) and try again.';
        chat.messages.push({ role: 'assistant', content: replyText });
        appendMessage('assistant', replyText);
      } finally {
        chat.mode = mode;
        saveChat(chat);
        renderSuggestions(followUps);
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }

    function resizeInput() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    function newChat() {
      chat.messages = [];
      saveChat(chat);
      paintMessages();
      input.focus();
    }

    openBtn.addEventListener('click', () => setOpen(panel.hidden));
    closeBtn.addEventListener('click', () => setOpen(false));
    clearBtn.addEventListener('click', newChat);
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

    paintMessages();
    refreshStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
