'use strict';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getSelection') {
    const sel = window.getSelection();
    sendResponse({ text: sel ? sel.toString() : '' });
  }
  return true;
});
