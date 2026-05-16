'use strict';

// ── Tab navigation ─────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Open options page
document.getElementById('btn-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById('link-options').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function setStatus(id, message, type) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = `status-msg ${type}`;
}

function hideStatus(id) {
  document.getElementById(id).className = 'status-msg hidden';
}

async function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['geminiApiKey'], r => resolve(r.geminiApiKey || ''));
  });
}

function copyText(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btnEl.textContent;
    btnEl.textContent = '✓ Copié !';
    setTimeout(() => { btnEl.textContent = original; }, 1800);
  });
}

// ── AI Summary ─────────────────────────────────────────────────────────────

async function checkApiKey() {
  const key = await getApiKey();
  document.getElementById('api-warning').classList.toggle('hidden', !!key);
  return key;
}

checkApiKey();

async function summarizeWithGemini(text, apiKey) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Tu es un assistant qui résume des textes en français de façon claire et concise.\n\nRésume ce texte en 3 à 6 phrases maximum :\n\n${text.slice(0, 14000)}`
        }]
      }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.25 }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Réponse vide de l\'API.');
  return content.trim();
}

async function runSummary(getText) {
  const apiKey = await checkApiKey();
  if (!apiKey) {
    setStatus('ai-status', '⚠️ Clé API requise — ouvrez les Options.', 'error');
    return;
  }

  const btnSel = document.getElementById('btn-summarize-selection');
  const btnPage = document.getElementById('btn-summarize-page');
  btnSel.disabled = true;
  btnPage.disabled = true;
  setStatus('ai-status', '⏳ Résumé en cours…', 'info');
  document.getElementById('ai-result').value = '';
  document.getElementById('btn-copy-summary').classList.add('hidden');

  try {
    const text = await getText();
    if (!text || text.trim().length < 30) {
      setStatus('ai-status', '❌ Pas assez de texte (sélectionnez du contenu ou chargez une page).', 'error');
      return;
    }
    const summary = await summarizeWithGemini(text, apiKey);
    document.getElementById('ai-result').value = summary;
    document.getElementById('btn-copy-summary').classList.remove('hidden');
    setStatus('ai-status', `✅ Résumé généré (${summary.length} caractères).`, 'success');
  } catch (err) {
    setStatus('ai-status', `❌ ${err.message}`, 'error');
  } finally {
    btnSel.disabled = false;
    btnPage.disabled = false;
  }
}

function getSelectedText() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return resolve('');
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelection' }, resp => {
        if (chrome.runtime.lastError) return resolve('');
        resolve(resp?.text || '');
      });
    });
  });
}

function getPageText() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return resolve('');
      chrome.scripting.executeScript(
        { target: { tabId: tabs[0].id }, func: () => document.body.innerText },
        results => {
          if (chrome.runtime.lastError) return resolve('');
          resolve(results?.[0]?.result || '');
        }
      );
    });
  });
}

document.getElementById('btn-summarize-selection').addEventListener('click', () => {
  runSummary(getSelectedText);
});

document.getElementById('btn-summarize-page').addEventListener('click', () => {
  runSummary(getPageText);
});

document.getElementById('btn-copy-summary').addEventListener('click', function () {
  copyText(document.getElementById('ai-result').value, this);
});

// Pre-detect selection to inform user
getSelectedText().then(text => {
  if (text && text.trim().length >= 30) {
    setStatus('ai-status', `📋 Texte sélectionné détecté (${text.length} car.). Cliquez pour résumer.`, 'info');
  }
});

// ── Code Tools ─────────────────────────────────────────────────────────────

// JSON
const jsonInput = document.getElementById('json-input');
const jsonError = document.getElementById('json-error');

function parseJSON() {
  try {
    const parsed = JSON.parse(jsonInput.value.trim());
    jsonError.classList.add('hidden');
    return parsed;
  } catch (e) {
    jsonError.textContent = `JSON invalide : ${e.message}`;
    jsonError.classList.remove('hidden');
    return null;
  }
}

document.getElementById('btn-format-json').addEventListener('click', () => {
  const parsed = parseJSON();
  if (parsed !== null) jsonInput.value = JSON.stringify(parsed, null, 2);
});

document.getElementById('btn-minify-json').addEventListener('click', () => {
  const parsed = parseJSON();
  if (parsed !== null) jsonInput.value = JSON.stringify(parsed);
});

document.getElementById('btn-copy-json').addEventListener('click', function () {
  copyText(jsonInput.value, this);
});

document.getElementById('btn-clear-json').addEventListener('click', () => {
  jsonInput.value = '';
  jsonError.classList.add('hidden');
});

// Base64
document.getElementById('btn-b64-encode').addEventListener('click', () => {
  try {
    const raw = document.getElementById('b64-input').value;
    document.getElementById('b64-output').value = btoa(unescape(encodeURIComponent(raw)));
  } catch {
    document.getElementById('b64-output').value = '❌ Encodage impossible';
  }
});

document.getElementById('btn-b64-decode').addEventListener('click', () => {
  try {
    const raw = document.getElementById('b64-input').value.trim();
    document.getElementById('b64-output').value = decodeURIComponent(escape(atob(raw)));
  } catch {
    document.getElementById('b64-output').value = '❌ Base64 invalide';
  }
});

document.getElementById('btn-copy-b64').addEventListener('click', function () {
  copyText(document.getElementById('b64-output').value, this);
});

// URL
document.getElementById('btn-url-encode').addEventListener('click', () => {
  document.getElementById('url-output').value =
    encodeURIComponent(document.getElementById('url-input').value);
});

document.getElementById('btn-url-decode').addEventListener('click', () => {
  try {
    document.getElementById('url-output').value =
      decodeURIComponent(document.getElementById('url-input').value);
  } catch {
    document.getElementById('url-output').value = '❌ URL invalide';
  }
});

document.getElementById('btn-copy-url').addEventListener('click', function () {
  copyText(document.getElementById('url-output').value, this);
});

// ── Game App ID ─────────────────────────────────────────────────────────────

document.getElementById('btn-search-game').addEventListener('click', searchGame);
document.getElementById('game-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchGame();
});

async function searchGame() {
  const query = document.getElementById('game-search').value.trim();
  if (!query) return;

  const resultsEl = document.getElementById('game-results');
  resultsEl.innerHTML = '';
  setStatus('game-status', '🔍 Recherche en cours…', 'info');

  try {
    const url =
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=french&cc=FR`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const items = data.items || [];
    if (items.length === 0) {
      setStatus('game-status', '❌ Aucun jeu trouvé sur Steam.', 'error');
      return;
    }

    hideStatus('game-status');

    items.slice(0, 12).forEach(game => {
      const item = document.createElement('div');
      item.className = 'game-item';
      item.title = `Cliquer pour copier l'App ID : ${game.id}`;

      const typeLabel = game.type === 'game' ? 'Jeu'
        : game.type === 'dlc' ? 'DLC'
        : game.type || '';

      item.innerHTML = `
        <span class="game-name">${escapeHtml(game.name)}</span>
        ${typeLabel ? `<span class="game-type">${escapeHtml(typeLabel)}</span>` : ''}
        <span class="game-id">${game.id}</span>
        <span class="copied-badge">✓</span>
      `;

      item.addEventListener('click', () => {
        navigator.clipboard.writeText(String(game.id));
        const badge = item.querySelector('.copied-badge');
        badge.classList.add('visible');
        setTimeout(() => badge.classList.remove('visible'), 1500);
      });

      resultsEl.appendChild(item);
    });
  } catch (err) {
    setStatus('game-status', `❌ Erreur : ${err.message}`, 'error');
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
