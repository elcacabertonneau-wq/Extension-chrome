const frame = document.getElementById('frame');
const empty = document.getElementById('empty');

function loadPreview() {
  chrome.storage.local.get(['devtoolkit-preview-html'], result => {
    const html = result['devtoolkit-preview-html'];
    if (!html) {
      frame.style.display = 'none';
      empty.style.display = 'flex';
      return;
    }
    frame.style.display = 'block';
    empty.style.display = 'none';
    frame.srcdoc = html;
  });
}

document.getElementById('btn-reload').addEventListener('click', loadPreview);
document.getElementById('btn-open-editor').addEventListener('click', () => {
  if (typeof chrome.action?.openPopup === 'function') {
    chrome.action.openPopup().catch(() => {});
  }
});

loadPreview();
