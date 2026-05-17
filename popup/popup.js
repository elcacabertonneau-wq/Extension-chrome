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

document.getElementById('btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ── Helpers ────────────────────────────────────────────────────────────────

function setStatus(id, message, type) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = `status-msg ${type}`;
}
function hideStatus(id) { document.getElementById(id).className = 'status-msg hidden'; }

function copyText(text, btnEl) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = '✓ Copié !';
    setTimeout(() => { btnEl.textContent = orig; }, 1800);
  });
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Extractive summarizer (TF-IDF local) ──────────────────────────────────

const STOPWORDS = new Set([
  'le','la','les','de','du','des','un','une','en','et','est','à','au','aux',
  'se','sa','son','ses','qui','que','qu','ce','cet','cette','ces','je','tu',
  'il','elle','nous','vous','ils','elles','mon','ma','mes','ton','ta','tes',
  'leur','leurs','y','me','te','lui','ne','pas','plus','très','aussi','car',
  'mais','ou','donc','or','ni','sur','sous','dans','par','pour','avec','sans',
  'entre','vers','chez','alors','puis','bien','tout','tous','même','si','on',
  'être','avoir','faire','dit','peut','après','avant','quand','comme','dont',
  'où','lors','était','sont','ont','été','fait','par','non',
  'the','a','an','is','are','was','were','be','been','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must',
  'can','could','of','in','on','at','to','for','with','by','from','and',
  'or','but','not','this','that','these','those','it','he','she','we',
  'they','i','you','its','his','her','our','their','which','who','what',
  'when','where','how','all','one','also','as','so','if','up','out','no',
  'new','more','said','about','just','into','than','then'
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-zàâäéèêëîïôùûüçœ'-]+/g) || [])
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function summarizeLocally(text, n = 5) {
  const sentences = text.replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+(?=[A-ZÀÂÉÈÙÎ"«(])/)
    .map(s => s.trim())
    .filter(s => { const wc = s.split(/\s+/).length; return wc >= 6 && wc <= 80; });

  if (!sentences.length) return text.slice(0, 800);
  if (sentences.length <= n) return sentences.join(' ');

  const freq = {};
  sentences.forEach(s => tokenize(s).forEach(w => { freq[w] = (freq[w] || 0) + 1; }));
  const total = sentences.length;

  return sentences
    .map((s, i) => {
      const words = tokenize(s);
      if (!words.length) return { s, score: 0, i };
      const tf  = words.reduce((sum, w) => sum + (freq[w] || 0), 0) / Math.sqrt(words.length);
      const pos = i < 3 ? 1.3 : i >= total - 2 ? 1.15 : 1.0;
      const len = words.length < 8 ? 0.8 : 1.0;
      return { s, score: tf * pos * len, i };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map(t => t.s)
    .join(' ');
}

// ── AI Summary ─────────────────────────────────────────────────────────────

async function runSummary(getText) {
  const btnSel  = document.getElementById('btn-summarize-selection');
  const btnPage = document.getElementById('btn-summarize-page');
  btnSel.disabled = btnPage.disabled = true;
  setStatus('ai-status', '⏳ Analyse en cours…', 'info');
  document.getElementById('ai-result').value = '';
  document.getElementById('btn-copy-summary').classList.add('hidden');

  try {
    const text = await getText();
    if (!text || text.trim().length < 100) {
      setStatus('ai-status', '❌ Pas assez de texte — sélectionnez plus de contenu.', 'error');
      return;
    }
    const summary = summarizeLocally(text, 5);
    document.getElementById('ai-result').value = summary;
    document.getElementById('btn-copy-summary').classList.remove('hidden');
    const ratio = Math.round((1 - summary.length / text.length) * 100);
    setStatus('ai-status', `✅ Résumé — texte réduit de ${ratio} %.`, 'success');
  } catch (err) {
    setStatus('ai-status', `❌ ${err.message}`, 'error');
  } finally {
    btnSel.disabled = btnPage.disabled = false;
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

document.getElementById('btn-summarize-selection').addEventListener('click', () => runSummary(getSelectedText));
document.getElementById('btn-summarize-page').addEventListener('click', () => runSummary(getPageText));
document.getElementById('btn-copy-summary').addEventListener('click', function () {
  copyText(document.getElementById('ai-result').value, this);
});

(function detectSelection() {
  const session = chrome.storage.session;
  const doDetect = () => getSelectedText().then(text => {
    if (text && text.trim().length >= 100)
      setStatus('ai-status', `📋 Texte sélectionné (${text.length} car.). Cliquez pour résumer.`, 'info');
  });
  if (session) {
    session.get(['pendingSelection'], r => {
      if (r.pendingSelection) {
        session.remove('pendingSelection');
        setStatus('ai-status', `📋 Texte depuis clic-droit (${r.pendingSelection.length} car.). Cliquez pour résumer.`, 'info');
      } else doDetect();
    });
  } else doDetect();
})();

// ── Calculator (no eval — recursive descent parser) ───────────────────────

function mathEval(expr) {
  expr = expr.replace(/\s/g, '').replace(/,/g, '.');
  let p = 0;
  const peek = () => expr[p];
  const eat   = c => { if (expr[p] === c) { p++; return true; } return false; };

  function parseExpr()  { return parseAddSub(); }
  function parseAddSub() {
    let v = parseMulDiv();
    while (p < expr.length && (peek() === '+' || peek() === '-')) {
      v = peek() === '+' ? (p++, v + parseMulDiv()) : (p++, v - parseMulDiv());
    }
    return v;
  }
  function parseMulDiv() {
    let v = parsePow();
    while (p < expr.length && (peek() === '*' || peek() === '/' || peek() === '%')) {
      const op = expr[p++];
      const r  = parsePow();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function parsePow() {
    let base = parseUnary();
    if (peek() === '^') { p++; base = Math.pow(base, parsePow()); }
    return base;
  }
  function parseUnary() {
    if (eat('-')) return -parsePrimary();
    eat('+');
    return parsePrimary();
  }
  function parsePrimary() {
    if (eat('(')) {
      const v = parseExpr();
      eat(')');
      return v;
    }
    // Functions: sqrt, abs, round, floor, ceil, log, sin, cos, tan
    const fnMatch = expr.slice(p).match(/^(sqrt|abs|round|floor|ceil|log|sin|cos|tan)\(/);
    if (fnMatch) {
      p += fnMatch[0].length;
      const arg = parseExpr();
      eat(')');
      return Math[fnMatch[1]](arg);
    }
    // pi / e
    if (expr.slice(p, p+2) === 'pi') { p += 2; return Math.PI; }
    if (expr[p] === 'e' && !/\d/.test(expr[p+1] || '')) { p++; return Math.E; }
    // Number
    const start = p;
    while (p < expr.length && /[\d.]/.test(expr[p])) p++;
    if (p === start) throw new Error('Syntaxe invalide');
    return parseFloat(expr.slice(start, p));
  }

  const result = parseExpr();
  if (!isFinite(result) || isNaN(result)) throw new Error('Résultat infini');
  return result;
}

const calcInput  = document.getElementById('calc-input');
const calcResult = document.getElementById('calc-result');

function doCalc() {
  const raw = calcInput.value.trim();
  if (!raw) return;
  try {
    const res = mathEval(raw);
    // Pretty print: avoid floating-point noise
    calcResult.value = Number.isInteger(res) ? String(res) : parseFloat(res.toPrecision(12)).toString();
  } catch (e) {
    calcResult.value = `❌ ${e.message}`;
  }
}

document.getElementById('btn-calc').addEventListener('click', doCalc);
calcInput.addEventListener('keydown', e => { if (e.key === 'Enter') doCalc(); });
document.getElementById('btn-copy-calc').addEventListener('click', function () {
  copyText(calcResult.value, this);
});

// ── Password Generator ─────────────────────────────────────────────────────

function generatePassword() {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?';
  let chars = '';
  if (document.getElementById('pw-upper').checked)   chars += upper;
  if (document.getElementById('pw-lower').checked)   chars += lower;
  if (document.getElementById('pw-digits').checked)  chars += digits;
  if (document.getElementById('pw-symbols').checked) chars += symbols;
  if (!chars) chars = lower + digits;

  const len = Math.min(64, Math.max(4, parseInt(document.getElementById('pw-length').value) || 16));
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  const pw = Array.from(arr).map(n => chars[n % chars.length]).join('');
  document.getElementById('pw-result').value = pw;
  updateStrength(pw);
}

function updateStrength(pw) {
  const bar = document.getElementById('pw-strength');
  const fill = document.getElementById('pw-strength-fill');
  bar.classList.remove('hidden');
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  fill.style.width      = `${Math.round((s/7)*100)}%`;
  fill.style.background = s <= 2 ? '#f87171' : s <= 4 ? '#fbbf24' : '#4ade80';
}

document.getElementById('btn-gen-pw').addEventListener('click', generatePassword);
document.getElementById('btn-copy-pw').addEventListener('click', function () {
  copyText(document.getElementById('pw-result').value, this);
});
generatePassword();

// ── Color converter ────────────────────────────────────────────────────────

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max+min)/2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0)) / 6; break;
      case g: h = ((b-r)/d + 2) / 6; break;
      case b: h = ((r-g)/d + 4) / 6; break;
    }
  }
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}

function updateColorFromHex(hex) {
  if (!/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(hex)) return;
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  document.getElementById('color-picker').value = hex.length === 4
    ? `#${hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3]}` : hex;
  document.getElementById('color-rgb').value = `rgb(${r}, ${g}, ${b})`;
  document.getElementById('color-hsl').value = `hsl(${h}, ${s}%, ${l}%)`;
}

const colorPicker = document.getElementById('color-picker');
const colorHex    = document.getElementById('color-hex');

colorPicker.addEventListener('input', () => {
  colorHex.value = colorPicker.value;
  updateColorFromHex(colorPicker.value);
});
colorHex.addEventListener('input', () => updateColorFromHex(colorHex.value));
colorHex.value = '#6366f1';
updateColorFromHex('#6366f1');

document.getElementById('btn-copy-hex').addEventListener('click', function () {
  copyText(colorHex.value, this);
});
document.getElementById('btn-copy-rgb').addEventListener('click', function () {
  copyText(document.getElementById('color-rgb').value, this);
});
document.getElementById('btn-copy-hsl').addEventListener('click', function () {
  copyText(document.getElementById('color-hsl').value, this);
});

// ── UUID Generator ─────────────────────────────────────────────────────────

function genUUID() {
  document.getElementById('uuid-result').value = crypto.randomUUID();
}

document.getElementById('btn-gen-uuid').addEventListener('click', genUUID);
document.getElementById('btn-copy-uuid').addEventListener('click', function () {
  copyText(document.getElementById('uuid-result').value, this);
});
genUUID();

// ── SHA-256 Hash ───────────────────────────────────────────────────────────

async function genHash() {
  const text = document.getElementById('hash-input').value;
  if (!text) { document.getElementById('hash-output').value = ''; return; }
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2,'0')).join('');
  document.getElementById('hash-output').value = hex;
}

document.getElementById('btn-gen-hash').addEventListener('click', genHash);
document.getElementById('hash-input').addEventListener('keydown', e => { if (e.key === 'Enter') genHash(); });
document.getElementById('btn-copy-hash').addEventListener('click', function () {
  copyText(document.getElementById('hash-output').value, this);
});

// ── Timestamp ─────────────────────────────────────────────────────────────

function updateTimestamp() {
  const raw = document.getElementById('ts-unix').value.trim();
  if (!raw) { document.getElementById('ts-date').value = ''; return; }
  const ts = parseInt(raw);
  if (isNaN(ts)) { document.getElementById('ts-date').value = '❌ Invalide'; return; }
  document.getElementById('ts-date').value = new Date(ts * 1000).toLocaleString('fr-FR', {
    weekday:'long', year:'numeric', month:'long',
    day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}

document.getElementById('ts-unix').addEventListener('input', updateTimestamp);
document.getElementById('btn-ts-now').addEventListener('click', () => {
  document.getElementById('ts-unix').value = Math.floor(Date.now() / 1000);
  updateTimestamp();
});
document.getElementById('btn-copy-ts').addEventListener('click', function () {
  copyText(document.getElementById('ts-unix').value, this);
});
document.getElementById('btn-ts-now').click();

// ── Code Tools (JSON / B64 / URL) ─────────────────────────────────────────

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

document.getElementById('btn-format-json').addEventListener('click', () => { const p = parseJSON(); if (p !== null) jsonInput.value = JSON.stringify(p, null, 2); });
document.getElementById('btn-minify-json').addEventListener('click', () => { const p = parseJSON(); if (p !== null) jsonInput.value = JSON.stringify(p); });
document.getElementById('btn-copy-json').addEventListener('click', function () { copyText(jsonInput.value, this); });
document.getElementById('btn-clear-json').addEventListener('click', () => { jsonInput.value = ''; jsonError.classList.add('hidden'); });

document.getElementById('btn-b64-encode').addEventListener('click', () => {
  try { document.getElementById('b64-output').value = btoa(unescape(encodeURIComponent(document.getElementById('b64-input').value))); }
  catch { document.getElementById('b64-output').value = '❌ Encodage impossible'; }
});
document.getElementById('btn-b64-decode').addEventListener('click', () => {
  try { document.getElementById('b64-output').value = decodeURIComponent(escape(atob(document.getElementById('b64-input').value.trim()))); }
  catch { document.getElementById('b64-output').value = '❌ Base64 invalide'; }
});
document.getElementById('btn-copy-b64').addEventListener('click', function () { copyText(document.getElementById('b64-output').value, this); });

document.getElementById('btn-url-encode').addEventListener('click', () => {
  document.getElementById('url-output').value = encodeURIComponent(document.getElementById('url-input').value);
});
document.getElementById('btn-url-decode').addEventListener('click', () => {
  try { document.getElementById('url-output').value = decodeURIComponent(document.getElementById('url-input').value); }
  catch { document.getElementById('url-output').value = '❌ URL invalide'; }
});
document.getElementById('btn-copy-url').addEventListener('click', function () { copyText(document.getElementById('url-output').value, this); });

// ── Dice Roller ────────────────────────────────────────────────────────────

const diceHistory = [];

document.querySelectorAll('.dice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sides  = parseInt(btn.dataset.sides);
    const result = Math.floor(Math.random() * sides) + 1;
    const display = document.getElementById('dice-display');

    display.classList.remove('rolling');
    void display.offsetWidth; // reflow
    display.classList.add('rolling');
    display.textContent = result;

    // Color coding: 1 = red, max = gold, else purple
    display.style.color = result === 1 ? '#f87171' : result === sides ? '#fbbf24' : '#818cf8';

    // History (last 8)
    diceHistory.unshift({ sides, result });
    if (diceHistory.length > 8) diceHistory.pop();
    const histEl = document.getElementById('dice-history');
    histEl.innerHTML = diceHistory
      .map(d => `<span class="dice-chip"><span class="die-label">D${d.sides}</span> ${d.result}</span>`)
      .join('');
  });
});

// ── Server Status ──────────────────────────────────────────────────────────

const SERVERS = [
  { name: 'Steam',       icon: '🎮', url: 'https://store.steampowered.com/api/featured/', parse: null },
  { name: 'Discord',     icon: '💬', url: 'https://discordstatus.com/api/v2/status.json', parse: d => d?.status?.indicator === 'none' ? 'up' : 'down' },
  { name: 'Epic Games',  icon: '🎯', url: 'https://store.epicgames.com/', parse: null },
  { name: 'PlayStation', icon: '🕹', url: 'https://status.playstation.com/', parse: null },
  { name: 'Xbox Live',   icon: '🟩', url: 'https://xnotify.xboxlive.com/servicestatusv6/US/en-US', parse: null }
];

async function checkServer(srv) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(srv.url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (srv.parse) {
      const data = await res.json().catch(() => null);
      return srv.parse(data) || (res.ok ? 'up' : 'down');
    }
    return res.ok ? 'up' : 'down';
  } catch { clearTimeout(t); return 'down'; }
}

function renderServerList(statuses) {
  document.getElementById('server-list').innerHTML = SERVERS.map((srv, i) => {
    const s = statuses[i] || 'loading';
    return `<div class="server-item">
      <div class="server-dot ${s}"></div>
      <span>${srv.icon} <strong class="server-name">${srv.name}</strong></span>
      <span class="server-label ${s}">${s === 'up' ? 'En ligne' : s === 'down' ? 'Hors ligne' : '…'}</span>
    </div>`;
  }).join('');
}

async function loadServerStatus() {
  renderServerList(SERVERS.map(() => 'loading'));
  renderServerList(await Promise.all(SERVERS.map(checkServer)));
}

document.getElementById('btn-refresh-status').addEventListener('click', loadServerStatus);
loadServerStatus();

// ── Game App ID ─────────────────────────────────────────────────────────────

document.getElementById('btn-search-game').addEventListener('click', searchGame);
document.getElementById('game-search').addEventListener('keydown', e => { if (e.key === 'Enter') searchGame(); });

async function searchGame() {
  const query = document.getElementById('game-search').value.trim();
  if (!query) return;
  const resultsEl = document.getElementById('game-results');
  resultsEl.innerHTML = '';
  setStatus('game-status', '🔍 Recherche en cours…', 'info');
  try {
    const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=french&cc=FR`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.items || [];
    if (!items.length) { setStatus('game-status', '❌ Aucun jeu trouvé.', 'error'); return; }
    hideStatus('game-status');
    items.slice(0, 12).forEach(game => {
      const el = document.createElement('div');
      el.className = 'game-item';
      const typeLabel = game.type === 'game' ? 'Jeu' : game.type === 'dlc' ? 'DLC' : game.type || '';
      el.innerHTML = `
        <span class="game-name">${esc(game.name)}</span>
        ${typeLabel ? `<span class="game-type">${esc(typeLabel)}</span>` : ''}
        <span class="game-id">${game.id}</span>
        <span class="copied-badge">✓</span>
      `;
      el.addEventListener('click', () => {
        navigator.clipboard.writeText(String(game.id));
        const b = el.querySelector('.copied-badge');
        b.classList.add('visible');
        setTimeout(() => b.classList.remove('visible'), 1500);
      });
      resultsEl.appendChild(el);
    });
  } catch (err) { setStatus('game-status', `❌ ${err.message}`, 'error'); }
}

// ── Timer (chrome.alarms pour notif même popup fermé) ─────────────────────

const timerDisplay = document.getElementById('timer-display');
let timerInterval  = null;
let timerEndTs     = 0;
let timerRunning   = false;

function formatHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function getTimerSeconds() {
  const h = parseInt(document.getElementById('timer-h').value) || 0;
  const m = parseInt(document.getElementById('timer-m').value) || 0;
  const s = parseInt(document.getElementById('timer-s').value) || 0;
  return h * 3600 + m * 60 + s;
}

function timerTick() {
  const remaining = Math.max(0, Math.round((timerEndTs - Date.now()) / 1000));
  timerDisplay.textContent = formatHMS(remaining);
  timerDisplay.classList.toggle('danger', remaining <= 10 && remaining > 0);
  if (remaining === 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRunning  = false;
    timerDisplay.classList.remove('danger');
    timerDisplay.classList.add('done');
    document.getElementById('btn-timer-start').disabled = false;
    document.getElementById('btn-timer-pause').disabled = true;
    setStatus('timer-status', '✅ Temps écoulé !', 'success');
  }
}

document.getElementById('btn-timer-start').addEventListener('click', () => {
  if (timerRunning) return;
  const total = getTimerSeconds();
  if (total <= 0) return;
  timerEndTs   = Date.now() + total * 1000;
  timerRunning = true;
  timerDisplay.classList.remove('done', 'danger');
  hideStatus('timer-status');

  // chrome.alarms: notification même si popup fermé
  if (chrome.alarms) {
    chrome.alarms.create('devtoolkit-timer', { delayInMinutes: total / 60 });
  }

  clearInterval(timerInterval);
  timerTick();
  timerInterval = setInterval(timerTick, 500);
  document.getElementById('btn-timer-start').disabled = true;
  document.getElementById('btn-timer-pause').disabled = false;
});

document.getElementById('btn-timer-pause').addEventListener('click', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRunning  = false;
    chrome.alarms?.clear('devtoolkit-timer');
    document.getElementById('btn-timer-start').disabled = false;
    document.getElementById('btn-timer-pause').disabled = true;
  }
});

document.getElementById('btn-timer-reset').addEventListener('click', () => {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning  = false;
  chrome.alarms?.clear('devtoolkit-timer');
  timerDisplay.textContent = formatHMS(getTimerSeconds());
  timerDisplay.classList.remove('done', 'danger');
  hideStatus('timer-status');
  document.getElementById('btn-timer-start').disabled = false;
  document.getElementById('btn-timer-pause').disabled = true;
});

['timer-h','timer-m','timer-s'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (!timerRunning) timerDisplay.textContent = formatHMS(getTimerSeconds());
  });
});
timerDisplay.textContent = formatHMS(getTimerSeconds());

// ── Chronomètre ────────────────────────────────────────────────────────────

let chronoStart   = 0;
let chronoElapsed = 0;
let chronoRunning = false;
let chronoRAF     = null;
let lapCount      = 0;
let lastLapTime   = 0;

function formatChronoMs(ms) {
  const centis = Math.floor((ms % 1000) / 10);
  const sec    = Math.floor(ms / 1000) % 60;
  const min    = Math.floor(ms / 60000) % 60;
  const hr     = Math.floor(ms / 3600000);
  if (hr > 0)
    return `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(centis).padStart(2,'0')}`;
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(centis).padStart(2,'0')}`;
}

function chronoFrame() {
  chronoElapsed = Date.now() - chronoStart;
  document.getElementById('chrono-display').textContent = formatChronoMs(chronoElapsed);
  if (chronoRunning) chronoRAF = requestAnimationFrame(chronoFrame);
}

document.getElementById('btn-chrono-start').addEventListener('click', function () {
  if (chronoRunning) {
    chronoRunning = false;
    cancelAnimationFrame(chronoRAF);
    this.textContent = '▶ Start';
    document.getElementById('btn-chrono-lap').disabled = true;
  } else {
    chronoStart   = Date.now() - chronoElapsed;
    chronoRunning = true;
    this.textContent = '⏸ Pause';
    document.getElementById('btn-chrono-lap').disabled = false;
    chronoRAF = requestAnimationFrame(chronoFrame);
  }
});

document.getElementById('btn-chrono-lap').addEventListener('click', () => {
  lapCount++;
  const lapTime  = chronoElapsed - lastLapTime;
  lastLapTime    = chronoElapsed;
  const lapsEl   = document.getElementById('chrono-laps');
  const item     = document.createElement('div');
  item.className = 'lap-item';
  item.innerHTML = `<span class="lap-num">Lap ${lapCount}</span><span>${formatChronoMs(chronoElapsed)}</span><span style="color:#64748b">+${formatChronoMs(lapTime)}</span>`;
  lapsEl.insertBefore(item, lapsEl.firstChild);
});

document.getElementById('btn-chrono-reset').addEventListener('click', () => {
  chronoRunning = false;
  cancelAnimationFrame(chronoRAF);
  chronoElapsed = lastLapTime = lapCount = 0;
  document.getElementById('chrono-display').textContent = '00:00.00';
  document.getElementById('btn-chrono-start').textContent = '▶ Start';
  document.getElementById('btn-chrono-lap').disabled = true;
  document.getElementById('chrono-laps').innerHTML = '';
});

// ── Notes rapides ──────────────────────────────────────────────────────────

const notesArea  = document.getElementById('notes-area');
const notesSaved = document.getElementById('notes-saved');
let saveTimer    = null;

chrome.storage.local.get(['quickNotes'], r => { if (r.quickNotes) notesArea.value = r.quickNotes; });

notesArea.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ quickNotes: notesArea.value }, () => {
      notesSaved.textContent = '✓ Sauvegardé';
      setTimeout(() => { notesSaved.textContent = ''; }, 1500);
    });
  }, 600);
});

document.getElementById('btn-copy-notes').addEventListener('click', function () { copyText(notesArea.value, this); });
document.getElementById('btn-clear-notes').addEventListener('click', () => {
  if (notesArea.value && !confirm('Effacer toutes les notes ?')) return;
  notesArea.value = '';
  chrome.storage.local.remove('quickNotes');
  notesSaved.textContent = 'Effacé';
  setTimeout(() => { notesSaved.textContent = ''; }, 1500);
});
