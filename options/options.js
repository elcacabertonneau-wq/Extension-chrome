'use strict';

const keyInput  = document.getElementById('api-key');
const statusEl  = document.getElementById('save-status');
const toggleBtn = document.getElementById('btn-toggle-key');

// Load saved key
chrome.storage.sync.get(['geminiApiKey'], r => {
  if (r.geminiApiKey) keyInput.value = r.geminiApiKey;
});

// Toggle visibility
toggleBtn.addEventListener('click', () => {
  const isPassword = keyInput.type === 'password';
  keyInput.type = isPassword ? 'text' : 'password';
  toggleBtn.textContent = isPassword ? 'Masquer' : 'Afficher';
});

// Save
document.getElementById('btn-save').addEventListener('click', () => {
  const key = keyInput.value.trim();
  if (!key) {
    flash('Clé vide !', 'fail');
    return;
  }
  chrome.storage.sync.set({ geminiApiKey: key }, () => flash('Sauvegardé ✓', 'ok'));
});

// Clear
document.getElementById('btn-clear').addEventListener('click', () => {
  chrome.storage.sync.remove('geminiApiKey', () => {
    keyInput.value = '';
    flash('Effacée ✓', 'ok');
  });
});

function flash(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = cls;
  setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 2500);
}
