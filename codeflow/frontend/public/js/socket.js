let socket = null;
const remoteTypingTimeouts = new Map();
const remoteDecorations = new Map();

function initSocket() {
  socket = io({ auth: { token: API.getToken() } });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    if (currentServerId) {
      socket.emit('join-server', { serverId: currentServerId });
    }
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error:', err.message);
    toast('Connection error: ' + err.message, 'error');
  });

  // Code change from another user
  socket.on('code-change', ({ filePath, content, user }) => {
    applyRemoteChange(filePath, content);
    showTypingBadge(user, filePath);
  });

  // Typing/cursor from another user
  socket.on('typing', ({ filePath, line, column, user }) => {
    showTypingBadge(user, filePath);
    if (monacoEditor && activeTab === filePath) {
      renderRemoteCursor(user, line, column);
    }
  });

  // Active users list updated
  socket.on('users-update', (users) => {
    renderActiveUsers(users);
  });

  // File saved (by anyone)
  socket.on('file-saved', ({ filePath, savedBy }) => {
    const tabEl = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
    if (tabEl) tabEl.classList.remove('modified');
    if (savedBy !== currentUser.email) {
      toast(`${savedBy.split('@')[0]} saved ${filePath.split('/').pop()}`, 'info');
    }
    setSaveStatus('saved');
  });

  // Auto-save happened on server
  socket.on('file-autosaved', ({ filePath }) => {
    const tabEl = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
    if (tabEl) tabEl.classList.remove('modified');
    if (activeTab === filePath) setSaveStatus('saved');
  });

  // File tree changed — reload for everyone
  socket.on('tree-changed', () => {
    if (currentServerId) {
      loadFileTree(currentServerId);
    }
  });

  // Chat message received
  socket.on('chat-message', ({ message, user, timestamp }) => {
    addChatMessage(message, user, timestamp);
    // Flash chat button if panel closed
    const chatPanel = document.getElementById('chat-panel');
    if (chatPanel.classList.contains('hidden') && user.email !== currentUser.email) {
      const btn = document.querySelector('[onclick="toggleChat()"]');
      if (btn) { btn.style.color = 'var(--accent)'; setTimeout(() => btn.style.color = '', 3000); }
    }
  });
}

function showTypingBadge(user, filePath) {
  const key = user.id || user.email;
  if (remoteTypingTimeouts.has(key)) clearTimeout(remoteTypingTimeouts.get(key));
  const el = document.getElementById('save-status');
  el.textContent = `✏️ ${user.name || user.email.split('@')[0]} editing ${filePath ? filePath.split('/').pop() : ''}...`;
  el.style.color = user.color;
  remoteTypingTimeouts.set(key, setTimeout(() => {
    el.style.color = '';
    const modified = activeTab && openTabs.get(activeTab)?.modified;
    setSaveStatus(modified ? 'unsaved' : 'saved');
    remoteTypingTimeouts.delete(key);
  }, 2000));
}

function renderRemoteCursor(user, line, column) {
  if (!monacoEditor) return;
  const key = (user.id || user.email).replace(/[^a-z0-9]/gi, '');
  const color = user.color || '#cba6f7';

  if (remoteDecorations.has(key)) {
    monacoEditor.deltaDecorations(remoteDecorations.get(key), []);
  }

  const styleId = `rcursor-${key}`;
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `.rcursor-${key} { border-left: 2px solid ${color}; }`;
    document.head.appendChild(s);
  }

  const dec = monacoEditor.deltaDecorations([], [{
    range: new monaco.Range(line, column, line, column),
    options: {
      className: `rcursor-${key}`,
      hoverMessage: { value: `**${user.name || user.email}**` },
      stickiness: 1
    }
  }]);
  remoteDecorations.set(key, dec);

  setTimeout(() => {
    if (remoteDecorations.has(key)) {
      monacoEditor.deltaDecorations(remoteDecorations.get(key), []);
      remoteDecorations.delete(key);
    }
  }, 5000);
}

function renderActiveUsers(users) {
  const container = document.getElementById('active-users');
  container.innerHTML = '';
  users.slice(0, 8).forEach(user => {
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.style.background = user.color;
    avatar.textContent = (user.name || user.email).charAt(0).toUpperCase();
    avatar.title = `${user.name || user.email}${user.currentFile ? ' — ' + user.currentFile.split('/').pop() : ''}`;
    container.appendChild(avatar);
  });
}

function toggleChat() {
  document.getElementById('chat-panel').classList.toggle('hidden');
}

function addChatMessage(message, user, timestamp) {
  const msgs = document.getElementById('chat-messages');
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<div class="chat-msg-name" style="color:${user.color||'#cba6f7'}">${escHtml(user.name||user.email)} <span style="color:#6c7086;font-weight:400">${time}</span></div><div class="chat-msg-text">${escHtml(message)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !socket || !currentServerId) return;
  socket.emit('chat-message', { serverId: currentServerId, message });
  input.value = '';
}
