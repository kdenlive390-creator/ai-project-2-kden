let socket = null;

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
    // Show subtle indicator
    showRemoteCursorIndicator(user);
  });

  // Cursor positions of other users
  socket.on('cursor-move', ({ filePath, line, column, user }) => {
    // Could render remote cursors in editor - basic version just shows in status
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

  // File tree changed by someone else
  socket.on('tree-changed', () => {
    if (currentServerId) loadFileTree(currentServerId);
  });

  // Chat messages
  socket.on('chat-message', ({ message, user, timestamp }) => {
    addChatMessage(message, user, timestamp);
  });
}

function renderActiveUsers(users) {
  const container = document.getElementById('active-users');
  container.innerHTML = '';
  users.slice(0, 8).forEach(user => {
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.style.background = user.color;
    avatar.textContent = (user.name || user.email).charAt(0).toUpperCase();
    avatar.title = user.name || user.email;
    avatar.setAttribute('data-tooltip', user.name || user.email);
    container.appendChild(avatar);
  });
}

let remoteIndicatorTimeout;
function showRemoteCursorIndicator(user) {
  const el = document.getElementById('save-status');
  el.textContent = `${user.name || user.email.split('@')[0]} is editing...`;
  clearTimeout(remoteIndicatorTimeout);
  remoteIndicatorTimeout = setTimeout(() => {
    if (!activeTab) return;
    const modified = openTabs.get(activeTab)?.modified;
    setSaveStatus(modified ? 'unsaved' : 'saved');
  }, 2000);
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
