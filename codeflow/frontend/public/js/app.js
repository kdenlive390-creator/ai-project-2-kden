let currentServerId = null;
let currentServerData = null;

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Check existing session
  const token = localStorage.getItem('cf_token');
  const userStr = localStorage.getItem('cf_user');

  if (token && userStr) {
    try {
      currentUser = JSON.parse(userStr);
      showDashboard();
    } catch {
      localStorage.clear();
      showScreen('auth-screen');
    }
  } else {
    showScreen('auth-screen');
  }

  // Init toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.id = 'toast-container';
  document.body.appendChild(toastContainer);

  // Sidebar resize
  setupSidebarResize();
});

// ===== IDE OPEN =====
async function openIDE(serverId) {
  showScreen('ide-screen');
  currentServerId = serverId;

  // Find server data
  const allS = [...(allServers.owned || []), ...(allServers.collaborated || [])];
  currentServerData = allS.find(s => s.id === serverId);
  if (currentServerData) {
    document.getElementById('ide-server-name').textContent = currentServerData.name;
    document.getElementById('invite-code-show').textContent = currentServerData.inviteCode;
  }

  // Init Monaco if not already
  if (!monacoEditor) {
    await initMonaco();
  }

  // Init socket
  if (!socket) initSocket();
  else socket.emit('join-server', { serverId });

  // Load file tree
  await loadFileTree(serverId);
}

function backToDashboard() {
  showScreen('dashboard-screen');
  currentServerId = null;
  currentServerData = null;
  stopPreviewAutoRefresh();
  // Don't destroy monaco — keep it for next IDE open
}

// ===== INVITE PANEL =====
function showInvitePanel() {
  document.getElementById('invite-panel').classList.remove('hidden');
}
function closeInvitePanel() {
  document.getElementById('invite-panel').classList.add('hidden');
}

function copyInviteCode() {
  const code = document.getElementById('invite-code-show').textContent;
  navigator.clipboard.writeText(code).then(() => toast('Code copied!', 'success'));
}

async function regenerateCode() {
  try {
    const data = await API.post(`/servers/${currentServerId}/regenerate-code`);
    document.getElementById('invite-code-show').textContent = data.inviteCode;
    toast('New invite code generated', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===== SIDEBAR RESIZE =====
function setupSidebarResize() {
  const handle = document.getElementById('sidebar-resize');
  const sidebar = document.getElementById('ide-sidebar');
  if (!handle || !sidebar) return;

  let dragging = false, startX, startW;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const newW = Math.max(150, Math.min(500, startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ===== TOAST =====
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ===== UTILS =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
