let allServers = { owned: [], collaborated: [] };

async function showDashboard() {
  showScreen('dashboard-screen');
  document.getElementById('dash-username').textContent = currentUser.name;
  await loadServers();
}

async function loadServers() {
  try {
    allServers = await API.get('/servers');
    renderServers();
  } catch (err) {
    console.error('Failed to load servers', err);
  }
}

function renderServers() {
  const ownedEl = document.getElementById('owned-servers');
  const collabEl = document.getElementById('collab-servers');

  if (allServers.owned.length === 0) {
    ownedEl.innerHTML = '<div class="empty-state">No workspaces yet. Create one to start coding!</div>';
  } else {
    ownedEl.innerHTML = allServers.owned.map(s => serverCard(s, true)).join('');
  }

  if (allServers.collaborated.length === 0) {
    collabEl.innerHTML = '<div class="empty-state">No collaborated workspaces. Join one with an invite code.</div>';
  } else {
    collabEl.innerHTML = allServers.collaborated.map(s => serverCard(s, false)).join('');
  }
}

function serverCard(server, isOwner) {
  const expires = new Date(server.expiresAt);
  const daysLeft = Math.max(0, Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24)));
  const collabCount = server.collaborators ? server.collaborators.length : 0;

  return `
    <div class="server-card" onclick="openIDE('${server.id}')">
      <div class="server-card-name">📁 ${escHtml(server.name)}</div>
      <div class="server-card-meta">
        ${isOwner ? '👑 Owner' : '👥 Collaborator'} · ${collabCount} collaborator${collabCount !== 1 ? 's' : ''}
      </div>
      <div class="server-card-expires">⏱ ${daysLeft} days left</div>
      ${isOwner ? `<button class="server-card-delete" onclick="event.stopPropagation(); deleteServer('${server.id}')" title="Delete">🗑</button>` : ''}
    </div>
  `;
}

function showCreateServer() {
  document.getElementById('create-modal').classList.remove('hidden');
  document.getElementById('new-server-name').focus();
}

async function createServer() {
  const name = document.getElementById('new-server-name').value.trim();
  if (!name) return toast('Enter a workspace name', 'error');

  try {
    await API.post('/servers', { name });
    document.getElementById('new-server-name').value = '';
    closeModal('create-modal');
    await loadServers();
    toast('Workspace created!', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function showJoinServer() {
  document.getElementById('join-modal').classList.remove('hidden');
  document.getElementById('invite-code-input').focus();
}

async function joinServer() {
  const code = document.getElementById('invite-code-input').value.trim().toUpperCase();
  if (!code) return toast('Enter an invite code', 'error');

  try {
    const data = await API.post('/servers/join', { inviteCode: code });
    document.getElementById('invite-code-input').value = '';
    closeModal('join-modal');
    await loadServers();
    toast(`Joined "${data.server.name}"!`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteServer(id) {
  if (!confirm('Delete this workspace? This cannot be undone.')) return;
  try {
    await API.delete(`/servers/${id}`);
    await loadServers();
    toast('Workspace deleted', 'info');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.add('hidden');
  }
});

// Enter on new server name
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-server-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') createServer();
  });
  document.getElementById('invite-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinServer();
  });
});
