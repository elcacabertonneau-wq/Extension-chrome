'use strict';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'devtoolkit-summarize',
    title: '🤖 Résumer avec DevToolkit',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'devtoolkit-summarize' && info.selectionText) {
    chrome.storage.session.set({ pendingSelection: info.selectionText });
    chrome.action.openPopup().catch(() => {});
  }
});
