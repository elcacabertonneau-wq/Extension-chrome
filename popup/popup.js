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

document.getElementById('btn-options').addEventListener('click', () => {
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

function copyText(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btnEl.textContent;
    btnEl.textContent = '✓ Copié !';
    setTimeout(() => { btnEl.textContent = original; }, 1800);
  });
}

// ── Extractive summarizer (TF-IDF, 100% local) ────────────────────────────

const STOPWORDS = new Set([
  // Français
  'le','la','les','de','du','des','un','une','en','et','est','à','au','aux',
  'se','sa','son','ses','qui','que','qu','ce','cet','cette','ces','je','tu',
  'il','elle','nous','vous','ils','elles','mon','ma','mes','ton','ta','tes',
  'leur','leurs','y','me','te','lui','ne','pas','plus','très','aussi','car',
  'mais','ou','donc','or','ni','sur','sous','dans','par','pour','avec','sans',
  'entre','vers','chez','alors','puis','bien','tout','tous','même','si','on',
  'être','avoir','faire','dit','peut','après','avant','quand','comme','dont',
  'où','lors','était','sont','ont','été','fait','cette','par','plus','non',
  // Anglais (pages en anglais)
  'the','a','an','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','shall','should','may','might',
  'must','can','could','of','in','on','at','to','for','with','by','from',
  'and','or','but','not','this','that','these','those','it','he','she',
  'we','they','i','you','its','his','her','our','their','which','who',
  'what','when','where','how','all','one','two','also','as','so','if',
  'up','out','no','new','more','said','about','just','into','than','then'
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-zàâäéèêëîïôùûüçœ'-]+/g) || [])
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function summarizeLocally(text, targetSentences = 5) {
  // Découpe en phrases
  const raw = text.replace(/\s+/g, ' ').trim();
  const sentences = raw
    .split(/(?<=[.!?…])\s+(?=[A-ZÀÂÉÈÙÎ"«(])/)
    .map(s => s.trim())
    .filter(s => {
      const wc = s.split(/\s+/).length;
      return wc >= 6 && wc <= 80;
    });

  if (sentences.length === 0) return raw.slice(0, 800);
  if (sentences.length <= targetSentences) return sentences.join(' ');

  // Fréquence des mots dans tout le texte
  const freq = {};
  sentences.forEach(s => {
    tokenize(s).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  });

  // Score de chaque phrase
  const total = sentences.length;
  const scored = sentences.map((s, i) => {
    const words = tokenize(s);
    if (words.length === 0) return { s, score: 0, i };

    // Somme TF normalisée par longueur
    const tfScore = words.reduce((sum, w) => sum + (freq[w] || 0), 0) / Math.sqrt(words.length);

    // Bonus position : intro et conclusion ont du poids
    const posBonus = (i < 3) ? 1.3 : (i >= total - 2) ? 1.15 : 1.0;

    // Malus pour les phrases très courtes
    const lenPenalty = words.length < 8 ? 0.8 : 1.0;

    return { s, score: tfScore * posBonus * lenPenalty, i };
  });

  // Top N phrases dans leur ordre d'origine
  const top = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, targetSentences)
    .sort((a, b) => a.i - b.i);

  return top.map(t => t.s).join(' ');
}

// ── AI Summary ─────────────────────────────────────────────────────────────

async function runSummary(getText) {
  const btnSel  = document.getElementById('btn-summarize-selection');
  const btnPage = document.getElementById('btn-summarize-page');
  btnSel.disabled  = true;
  btnPage.disabled = true;
  setStatus('ai-status', '⏳ Analyse en cours…', 'info');
  document.getElementById('ai-result').value = '';
  document.getElementById('btn-copy-summary').classList.add('hidden');

  try {
    const text = await getText();
    if (!text || text.trim().length < 100) {
      setStatus('ai-status', '❌ Pas assez de texte (sélectionnez plus de contenu).', 'error');
      return;
    }
    const summary = summarizeLocally(text, 5);
    document.getElementById('ai-result').value = summary;
    document.getElementById('btn-copy-summary').classList.remove('hidden');
    const ratio = Math.round((1 - summary.length / text.length) * 100);
    setStatus('ai-status', `✅ Résumé généré — texte réduit de ${ratio} %.`, 'success');
  } catch (err) {
    setStatus('ai-status', `❌ ${err.message}`, 'error');
  } finally {
    btnSel.disabled  = false;
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

// Informe l'utilisateur si du texte est déjà sélectionné
function loadPendingOrActive() {
  const session = chrome.storage.session;
  if (session) {
    session.get(['pendingSelection'], r => {
      if (r.pendingSelection) {
        session.remove('pendingSelection');
        setStatus('ai-status', `📋 Texte depuis clic-droit (${r.pendingSelection.length} car.). Cliquez pour résumer.`, 'info');
        return;
      }
      detectSelection();
    });
  } else {
    detectSelection();
  }
}

function detectSelection() {
  getSelectedText().then(text => {
    if (text && text.trim().length >= 100)
      setStatus('ai-status', `📋 Texte sélectionné (${text.length} car.). Cliquez pour résumer.`, 'info');
  });
}

loadPendingOrActive();

// ── Code Tools ─────────────────────────────────────────────────────────────

const jsonInput = document.getElementById('json-input');
const jsonError = document.getElementById('json-error');

function parseJSON() {
  try {
    const p = JSON.parse(jsonInput.value.trim());
    jsonError.classList.add('hidden');
    return p;
  } catch (e) {
    jsonError.textContent = `JSON invalide : ${e.message}`;
    jsonError.classList.remove('hidden');
    return null;
  }
}

document.getElementById('btn-format-json').addEventListener('click', () => {
  const p = parseJSON();
  if (p !== null) jsonInput.value = JSON.stringify(p, null, 2);
});

document.getElementById('btn-minify-json').addEventListener('click', () => {
  const p = parseJSON();
  if (p !== null) jsonInput.value = JSON.stringify(p);
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
    document.getElementById('b64-output').value =
      btoa(unescape(encodeURIComponent(document.getElementById('b64-input').value)));
  } catch {
    document.getElementById('b64-output').value = '❌ Encodage impossible';
  }
});

document.getElementById('btn-b64-decode').addEventListener('click', () => {
  try {
    document.getElementById('b64-output').value =
      decodeURIComponent(escape(atob(document.getElementById('b64-input').value.trim())));
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
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=french&cc=FR`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.items || [];

    if (!items.length) {
      setStatus('game-status', '❌ Aucun jeu trouvé.', 'error');
      return;
    }

    hideStatus('game-status');

    items.slice(0, 12).forEach(game => {
      const el = document.createElement('div');
      el.className = 'game-item';
      const typeLabel = game.type === 'game' ? 'Jeu'
        : game.type === 'dlc' ? 'DLC'
        : game.type || '';

      el.innerHTML = `
        <span class="game-name">${esc(game.name)}</span>
        ${typeLabel ? `<span class="game-type">${esc(typeLabel)}</span>` : ''}
        <span class="game-id">${game.id}</span>
        <span class="copied-badge">✓</span>
      `;

      el.addEventListener('click', () => {
        navigator.clipboard.writeText(String(game.id));
        const badge = el.querySelector('.copied-badge');
        badge.classList.add('visible');
        setTimeout(() => badge.classList.remove('visible'), 1500);
      });

      resultsEl.appendChild(el);
    });
  } catch (err) {
    setStatus('game-status', `❌ ${err.message}`, 'error');
  }
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
