let terminalSocket = null;
let terminalOpen = false;
let commandHistory = [];
let historyIndex = -1;
let currentCommand = '';

function toggleTerminal() {
  const panel = document.getElementById('terminal-panel');
  terminalOpen = !terminalOpen;
  panel.classList.toggle('hidden', !terminalOpen);
  document.getElementById('terminal-toggle-btn').classList.toggle('active', terminalOpen);

  if (terminalOpen) {
    if (!terminalSocket) initTerminalSocket();
    document.getElementById('terminal-input').focus();
  }
}

function initTerminalSocket() {
  terminalSocket = io('/terminal', { auth: { token: API.getToken() } });

  terminalSocket.on('connect', () => {
    document.getElementById('terminal-status').textContent = 'Connected';
    document.getElementById('terminal-status').style.color = 'var(--accent-green)';
    if (currentServerId) {
      terminalSocket.emit('start-terminal', { serverId: currentServerId });
    }
  });

  terminalSocket.on('disconnect', () => {
    document.getElementById('terminal-status').textContent = 'Disconnected';
    document.getElementById('terminal-status').style.color = 'var(--accent-red)';
  });

  terminalSocket.on('terminal-output', (data) => {
    appendTerminalOutput(data);
  });

  // Handle input
  const input = document.getElementById('terminal-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = input.value;
      commandHistory.unshift(cmd);
      historyIndex = -1;
      appendTerminalOutput(`\r\n$ ${cmd}\r\n`);
      terminalSocket.emit('terminal-input', cmd + '\n');
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        input.value = commandHistory[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = commandHistory[historyIndex];
      } else {
        historyIndex = -1;
        input.value = '';
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      terminalSocket.emit('terminal-input', '\x03');
      input.value = '';
    }
  });
}

function appendTerminalOutput(text) {
  const output = document.getElementById('terminal-output');
  // Basic ANSI stripping for clean display
  const clean = text.replace(/\x1b\[[0-9;]*[mGKHFJABCDEFnsu]/g, '')
                     .replace(/\x1b\]/g, '');
  const span = document.createElement('span');
  span.textContent = clean;
  output.appendChild(span);
  output.scrollTop = output.scrollHeight;
}

function clearTerminal() {
  document.getElementById('terminal-output').innerHTML = '';
}

// Upload files
async function uploadFiles(input) {
  if (!input.files.length || !currentServerId) return;
  const formData = new FormData();
  for (const file of input.files) {
    formData.append('files', file);
  }

  try {
    const token = API.getToken();
    const res = await fetch(`/api/files/${currentServerId}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await loadFileTree(currentServerId);
    if (socket) socket.emit('tree-changed', { serverId: currentServerId });
    toast(`Uploaded ${data.files.length} file(s)`, 'success');
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
  }
  input.value = '';
}

// Download workspace as ZIP
async function downloadWorkspace() {
  if (!currentServerId) return;
  toast('Preparing download...', 'info');
  const token = API.getToken();
  const res = await fetch(`/api/terminal/${currentServerId}/download`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) { toast('Download failed', 'error'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${document.getElementById('ide-server-name').textContent || 'workspace'}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Downloaded!', 'success');
}
