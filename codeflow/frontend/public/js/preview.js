function toggleLivePreview() {
  if (!currentServerId) return;
  // Save current file first, then open in new tab
  saveCurrentFile().then(() => {
    openPreviewExternal();
  });
}

function openPreviewExternal() {
  if (!currentServerId) return;
  window.open(`/workspace-files/${currentServerId}/index.html`, '_blank');
}

function refreshPreview() {
  // No-op — preview is now always a new tab
}
