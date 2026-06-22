let previewOpen = false;
let previewRefreshTimer = null;

function toggleLivePreview() {
  const panel = document.getElementById('preview-panel');
  const btn = document.getElementById('preview-toggle-btn');
  previewOpen = !previewOpen;
  panel.classList.toggle('hidden', !previewOpen);
  btn.classList.toggle('active', previewOpen);

  if (previewOpen) {
    loadPreview();
    // Auto-refresh on code changes
    startPreviewAutoRefresh();
  } else {
    stopPreviewAutoRefresh();
  }
}

function loadPreview() {
  if (!currentServerId) return;
  const iframe = document.getElementById('preview-iframe');
  iframe.src = `/workspace-files/${currentServerId}/index.html`;
}

function refreshPreview() {
  if (!currentServerId || !previewOpen) return;
  const iframe = document.getElementById('preview-iframe');
  // Save current file first, then reload
  saveCurrentFile().then(() => {
    iframe.src = iframe.src;
  });
}

function openPreviewExternal() {
  if (!currentServerId) return;
  window.open(`/workspace-files/${currentServerId}/index.html`, '_blank');
}

function startPreviewAutoRefresh() {
  // Listen for saves and refresh
  if (socket) {
    socket.on('file-saved', handlePreviewRefresh);
    socket.on('file-autosaved', handlePreviewRefresh);
  }
}

function stopPreviewAutoRefresh() {
  if (socket) {
    socket.off('file-saved', handlePreviewRefresh);
    socket.off('file-autosaved', handlePreviewRefresh);
  }
}

function handlePreviewRefresh({ filePath }) {
  // Only refresh for web files
  const ext = (filePath || '').split('.').pop().toLowerCase();
  if (['html', 'css', 'js'].includes(ext) && previewOpen) {
    clearTimeout(previewRefreshTimer);
    previewRefreshTimer = setTimeout(() => {
      const iframe = document.getElementById('preview-iframe');
      if (iframe) iframe.src = iframe.src;
    }, 500);
  }
}
