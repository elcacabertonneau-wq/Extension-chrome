'use strict';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'devtoolkit-summarize',
    title: '🤖 Résumer avec DevToolkit',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'devtoolkit-summarize' && info.selectionText) {
    chrome.storage.session.set({ pendingSelection: info.selectionText });
    if (typeof chrome.action.openPopup === 'function') {
      chrome.action.openPopup().catch(() => {});
    }
  }
});

// Notification quand le timer se termine (fonctionne même popup fermé)
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'devtoolkit-timer') {
    chrome.notifications.create('timer-done', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '⏱ DevToolkit — Timer',
      message: 'Temps écoulé !',
      priority: 2
    });
  }
});
