let fileTree = [];
let selectedTreePath = null;
let contextMenuTarget = null;

const FILE_ICONS = {
  // Languages
  js: '🟨', ts: '🔷', jsx: '⚛️', tsx: '⚛️',
  html: '🌐', css: '🎨', scss: '💅', sass: '💅',
  json: '📋', md: '📝', txt: '📄',
  py: '🐍', java: '☕', php: '🐘', rb: '💎',
  go: '🐹', rs: '⚙️', cpp: '⚙️', c: '⚙️',
  sh: '💻', bash: '💻', sql: '🗄️',
  xml: '📰', svg: '🖼️', yaml: '⚙️', yml: '⚙️',
  toml: '⚙️', env: '🔐', gitignore: '🚫',
  dockerfile: '🐳', lock: '🔒', vue: '💚', svelte: '🟠',
};

function getFileIcon(name, ext) {
  if (name === '.env' || name === '.gitignore') return FILE_ICONS[name.substring(1)] || '📄';
  return FILE_ICONS[ext] || '📄';
}

function getIconClass(ext) {
  return `icon-${ext}`;
}

async function loadFileTree(serverId) {
  try {
    const tree = await API.get(`/files/${serverId}/tree`);
    fileTree = tree;
    renderFileTree(tree, document.getElementById('file-tree'), serverId, 0);
  } catch (err) {
    console.error('Failed to load file tree:', err);
    toast('Failed to load files', 'error');
  }
}

function renderFileTree(nodes, container, serverId, depth) {
  container.innerHTML = '';
  for (const node of nodes) {
    container.appendChild(createTreeNode(node, serverId, depth));
  }
}

function appendTreeNodes(nodes, container, serverId, depth) {
  for (const node of nodes) {
    container.appendChild(createTreeNode(node, serverId, depth));
  }
}

function createTreeNode(node, serverId, depth) {
  const wrapper = document.createElement('div');

  const item = document.createElement('div');
  item.className = 'tree-item';
  item.dataset.path = node.path;
  item.dataset.type = node.type;
  item.style.paddingLeft = `${8 + depth * 14}px`;

  if (node.type === 'folder') {
    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    arrow.textContent = '▶';
    item.appendChild(arrow);

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '📁';
    item.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.name;
    item.appendChild(label);

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    childContainer.style.display = 'none';

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = childContainer.style.display !== 'none';
      childContainer.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('open', !isOpen);
      icon.textContent = isOpen ? '📁' : '📂';
    });

    if (node.children && node.children.length > 0) {
      childContainer.innerHTML = '';
      for (const child of node.children) {
        childContainer.appendChild(createTreeNode(child, serverId, depth + 1));
      }
    }

    item.addEventListener('contextmenu', (e) => showContextMenu(e, node));
    wrapper.appendChild(item);
    wrapper.appendChild(childContainer);
  } else {
    const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
    const spacer = document.createElement('span');
    spacer.style.width = '14px';
    spacer.style.display = 'inline-block';
    item.appendChild(spacer);

    const icon = document.createElement('span');
    icon.className = `tree-icon ${getIconClass(ext)}`;
    icon.textContent = getFileIcon(node.name, ext);
    item.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.name;
    item.appendChild(label);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      selectTreeItem(item, node.path);
      openFile(serverId, node.path);
    });

    item.addEventListener('contextmenu', (e) => showContextMenu(e, node));
    wrapper.appendChild(item);
  }

  return wrapper;
}

function selectTreeItem(el, path) {
  document.querySelectorAll('.tree-item.selected').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  selectedTreePath = path;
}

async function refreshTree() {
  if (!currentServerId) return;
  await loadFileTree(currentServerId);
  toast('Refreshed', 'info');
}

// New file
async function newFile(parentPath = '') {
  const name = prompt('File name:');
  if (!name) return;
  const fp = parentPath ? `${parentPath}/${name}` : name;
  try {
    await API.post(`/files/${currentServerId}/write`, { filePath: fp, content: '' });
    await loadFileTree(currentServerId);
    socket.emit('tree-changed', { serverId: currentServerId });
    await openFile(currentServerId, fp);
    toast('File created', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// New folder
async function newFolder(parentPath = '') {
  const name = prompt('Folder name:');
  if (!name) return;
  const fp = parentPath ? `${parentPath}/${name}` : name;
  try {
    await API.post(`/files/${currentServerId}/mkdir`, { folderPath: fp });
    await loadFileTree(currentServerId);
    socket.emit('tree-changed', { serverId: currentServerId });
    toast('Folder created', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Context menu
function showContextMenu(e, node) {
  e.preventDefault();
  e.stopPropagation();
  contextMenuTarget = node;
  const menu = document.getElementById('context-menu');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  menu.classList.remove('hidden');
}

function hideContextMenu() {
  document.getElementById('context-menu').classList.add('hidden');
  contextMenuTarget = null;
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });

async function ctxNewFile() {
  hideContextMenu();
  const parent = contextMenuTarget && contextMenuTarget.type === 'folder' ? contextMenuTarget.path : '';
  await newFile(parent);
}

async function ctxNewFolder() {
  hideContextMenu();
  const parent = contextMenuTarget && contextMenuTarget.type === 'folder' ? contextMenuTarget.path : '';
  await newFolder(parent);
}

async function ctxRename() {
  if (!contextMenuTarget) return;
  hideContextMenu();
  const node = contextMenuTarget;
  const newName = prompt(`Rename "${node.name}" to:`, node.name);
  if (!newName || newName === node.name) return;

  const oldPath = node.path;
  const parts = oldPath.split('/');
  parts[parts.length - 1] = newName;
  const newPath = parts.join('/');

  try {
    await API.post(`/files/${currentServerId}/rename`, { oldPath, newPath });
    await loadFileTree(currentServerId);
    socket.emit('tree-changed', { serverId: currentServerId });
    toast('Renamed', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function ctxDelete() {
  if (!contextMenuTarget) return;
  hideContextMenu();
  const node = contextMenuTarget;
  if (!confirm(`Delete "${node.name}"? This cannot be undone.`)) return;

  try {
    await API.request('DELETE', `/files/${currentServerId}/delete`, { filePath: node.path });
    // Close tab if open
    closeTab(node.path);
    await loadFileTree(currentServerId);
    socket.emit('tree-changed', { serverId: currentServerId });
    toast('Deleted', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}
