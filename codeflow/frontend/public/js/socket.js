let socket = null;
const remoteTypingTimeouts = new Map(); // userId -> timeout

function initSocket() {
  socket = io({ auth: { token: API.getToken() } });

  socket.on('connect', () => {
    console.log('Socket connected');
    if (currentServerId) {
      socket.emit('join-server', { serverId: currentServerId });
    }
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error:', err.message);
  });

  // Real-time code updates from other users
  socket.on('code-change', ({ filePath, content, user }) => {
    applyRemoteChange(filePath, content);
    showTypingBadge(user, filePath);
  });

  // Typing indicator from other users
  socket.on('typing', ({ filePath, line, column, user }) => {
    showTypingBadge(user, filePath);
    renderRemoteCursor(user, filePath, line, column);
  });

  // Users in this workspace
  socket.on('users-update', (users) => {
    renderActiveUsers(users);
  });

  // File saved by someone
  socket.on('file-saved', ({ filePath, savedBy, savedAt }) => {
    if (savedBy !== currentUser.email) {
      toast(`${savedBy.split('@')[0]} saved ${filePath.split('/').pop()}`, 'info');
    }
    setSaveStatus('saved');
  });

  // Auto-save notification
  socket.on('file-autosaved', ({ filePath }) => {
    if (activeTab === filePath) {
      setSaveStatus('saved');
      const tabEl = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
      if (tabEl) tabEl.classList.remove('modified');
    }
  });

  // File tree changed — reload tree for everyone
  socket.on('tree-changed', () => {
    if (currentServerId) loadFileTree(currentServerId);
  });

  // Chat messages
  socket.on('chat-message', ({ message, user, timestamp }) => {
    addChatMessage(message, user, timestamp);
  });
}

// Show who is typing in the status bar
function showTypingBadge(user, filePath) {
  const key = user.id || user.email;
  if (remoteTypingTimeouts.has(key)) clearTimeout(remoteTypingTimeouts.get(key));

  const el = document.getElementById('save-status');
  el.textContent = `✏️ ${user.name || user.email.split('@')[0]} is editing ${filePath ? filePath.split('/').pop() : ''}...`;
  el.style.color = user.color;

  const t = setTimeout(() => {
    el.style.color = '';
    const modified = activeTab && openTabs.get(activeTab)?.modified;
    setSaveStatus(modified ? 'unsaved' : 'saved');
    remoteTypingTimeouts.delete(key);
  }, 2000);

  remoteTypingTimeouts.set(key, t);
}

// Render a remote cursor decoration in Monaco
const remoteDecorations = new Map(); // userId -> decorationIds[]

function renderRemoteCursor(user, filePath, line, column) {
  if (!monacoEditor || activeTab !== filePath) return;

  const key = user.id || user.email;
  const color = user.color || '#cba6f7';

  // Remove old decoration
  if (remoteDecorations.has(key)) {
    monacoEditor.deltaDecorations(remoteDecorations.get(key), []);
  }

  // Add new cursor + line highlight decoration
  const decorations = monacoEditor.deltaDecorations([], [
    {
      range: new monaco.Range(line, column, line, column + 1),
      options: {
        className: `remote-cursor-${key.replace(/[^a-z0-9]/gi, '')}`,
        beforeContentClassName: `remote-cursor-before`,
        hoverMessage: { value: `**${user.name || user.email}**` },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        afterContentClassName: `remote-cursor-label`,
        glyphMarginClassName: 'remote-cursor-glyph',
        isWholeLine: false,
        overviewRuler: { color, position: monaco.editor.OverviewRulerLane.Right }
      }
    }
  ]);

  remoteDecorations.set(key, decorations);

  // Inject dynamic CSS for this user's cursor color
  const styleId = `cursor-style-${key.replace(/[^a-z0-9]/gi, '')}`;
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .remote-cursor-before { border-left: 2px solid ${color}; margin-left: -1px; }
    `;
    document.head.appendChild(style);
  }

  // Auto-clear after 5 seconds of no movement
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

// Chat
function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('hidden');
}

function addChatMessage(message, user, timestamp) {
  const msgs = document.getElementById('chat-messages');
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `
    <div class="chat-msg-name" style="color:${user.color || '#cba6f7'}">${escHtml(user.name || user.email)} <span style="color:#6c7086;font-weight:400">${time}</span></div>
    <div class="chat-msg-text">${escHtml(message)}</div>
  `;
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
