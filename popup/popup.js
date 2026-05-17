'use strict';

// ── Tab navigation ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ── Helpers ─────────────────────────────────────────────────────────────────

function setStatus(id, message, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `status-msg ${type}`;
}
function hideStatus(id) {
  const el = document.getElementById(id);
  if (el) el.className = 'status-msg hidden';
}

function copyText(text, btnEl) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = '✓ Copié !';
    setTimeout(() => { btnEl.textContent = orig; }, 1800);
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// ── Theme System ─────────────────────────────────────────────────────────────

const THEMES = {
  dark: {
    '--bg': '#0f172a', '--surface': '#1e293b', '--surface2': '#243047',
    '--border': '#334155', '--accent': '#6366f1', '--accent-dim': '#4f46e5',
    '--text': '#e2e8f0', '--muted': '#64748b',
    '--header-from': '#6366f1', '--header-to': '#8b5cf6'
  },
  oled: {
    '--bg': '#000000', '--surface': '#0a0a0a', '--surface2': '#111111',
    '--border': '#1a1a1a', '--accent': '#7c3aed', '--accent-dim': '#6d28d9',
    '--text': '#e2e8f0', '--muted': '#4b5563',
    '--header-from': '#312e81', '--header-to': '#4c1d95'
  },
  gaming: {
    '--bg': '#050a0e', '--surface': '#0d1b2a', '--surface2': '#1b2838',
    '--border': '#1f4068', '--accent': '#00ff88', '--accent-dim': '#00cc6a',
    '--text': '#e2e8f0', '--muted': '#4a6fa5',
    '--header-from': '#00c853', '--header-to': '#00e676'
  },
  purple: {
    '--bg': '#12041e', '--surface': '#1e0533', '--surface2': '#2a0a42',
    '--border': '#4a1a6e', '--accent': '#c084fc', '--accent-dim': '#a855f7',
    '--text': '#f3e8ff', '--muted': '#9333ea',
    '--header-from': '#7e22ce', '--header-to': '#c026d3'
  },
  opera: {
    '--bg': '#1a0505', '--surface': '#2d0b0b', '--surface2': '#3d1111',
    '--border': '#5c1f1f', '--accent': '#ff3333', '--accent-dim': '#cc0000',
    '--text': '#ffe4e4', '--muted': '#9f5050',
    '--header-from': '#b91c1c', '--header-to': '#dc2626'
  },
  light: {
    '--bg': '#f1f5f9', '--surface': '#ffffff', '--surface2': '#e2e8f0',
    '--border': '#cbd5e1', '--accent': '#6366f1', '--accent-dim': '#4f46e5',
    '--text': '#0f172a', '--muted': '#64748b',
    '--header-from': '#6366f1', '--header-to': '#8b5cf6'
  }
};

function applyTheme(themeKey, customAccent = null) {
  const vars = THEMES[themeKey] || THEMES.dark;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  if (customAccent) {
    root.style.setProperty('--accent', customAccent);
    root.style.setProperty('--accent-dim', customAccent);
  }
  document.querySelectorAll('.theme-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === themeKey)
  );
}

// ── Content helpers ──────────────────────────────────────────────────────────

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

// ── AI Chat ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  chat:       'Tu es DevIA, un assistant IA expert et direct intégré dans le navigateur. Tu maîtrises la tech, le gaming, le développement web, les mathématiques et les sciences. Réponds en français, de manière concise et précise. Utilise du markdown si utile (gras, italique, code).',
  resume:     'Résume le texte suivant en 3 à 6 phrases claires et concises en français. Garde uniquement les informations essentielles.',
  correction: "Corrige les fautes d'orthographe, de grammaire et de style du texte suivant. Retourne uniquement le texte corrigé, sans explication.",
  traduction: 'Si le texte est en français, traduis-le en anglais. Sinon, traduis-le en français. Retourne uniquement la traduction.',
  expliquer:  "Explique simplement le concept ou texte suivant comme à un débutant. Utilise des analogies concrètes et un vocabulaire accessible."
};

let chatHistory = [];
let aiEngine = 'pollinations';
let chromeAiSession = null;

async function initAI() {
  const badge = document.getElementById('ai-engine-badge');
  try {
    if (window.ai && window.ai.languageModel) {
      const cap = await window.ai.languageModel.capabilities();
      if (cap.available === 'readily' || cap.available === 'after-download') {
        aiEngine = 'chrome';
        badge.textContent = '⚡ Chrome AI (local)';
        badge.style.cssText = 'background:rgba(74,222,128,0.15);color:#4ade80;';
        return;
      }
    }
  } catch {}
  aiEngine = 'pollinations';
  badge.textContent = '🌐 Pollinations.ai';
  badge.style.cssText = 'background:rgba(99,102,241,0.15);color:#818cf8;';
}

async function* streamChromeAI(userMessage, systemPrompt) {
  if (!chromeAiSession) {
    chromeAiSession = await window.ai.languageModel.create({ systemPrompt });
  }
  const stream = chromeAiSession.promptStreaming(userMessage);
  let lastLen = 0;
  for await (const chunk of stream) {
    const newText = chunk.slice(lastLen);
    lastLen = chunk.length;
    if (newText) yield newText;
  }
}

async function* streamPollinationsAI(messages, modelId) {
  const MODEL_MAP = { openai: 'openai', mistral: 'mistral', llama: 'llama' };
  const model = MODEL_MAP[modelId] || 'openai';

  const resp = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, seed: Math.floor(Math.random() * 9999) })
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const parsed = JSON.parse(raw);
        const chunk = parsed.choices?.[0]?.delta?.content || '';
        if (chunk) yield chunk;
      } catch {}
    }
  }
}

function formatMarkdown(text) {
  return esc(text)
    .replace(/```[\s\S]*?```/g, m => `<pre><code>${m.slice(3, -3).replace(/^[a-z]+\n/, '')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function appendChatMsg(role, content = '', streaming = false) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  const avatar = role === 'assistant' ? '🤖' : '👤';
  const bubbleId = `bubble-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  div.innerHTML = `<span class="chat-avatar">${avatar}</span><div class="chat-bubble" id="${bubbleId}">${streaming ? '<span class="typing-cursor"></span>' : esc(content)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return bubbleId;
}

function updateBubble(bubbleId, text) {
  const el = document.getElementById(bubbleId);
  if (!el) return;
  el.innerHTML = formatMarkdown(text) + '<span class="typing-cursor"></span>';
  el.closest('.chat-messages').scrollTop = el.closest('.chat-messages').scrollHeight;
}

function finishBubble(bubbleId, text) {
  const el = document.getElementById(bubbleId);
  if (!el) return;
  el.innerHTML = formatMarkdown(text);
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  const mode = document.getElementById('ai-mode').value;
  const modelId = document.getElementById('ai-model').value;
  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat;

  appendChatMsg('user', msg);
  chatHistory.push({ role: 'user', content: msg });

  const bubbleId = appendChatMsg('assistant', '', true);
  const sendBtn = document.getElementById('btn-send-chat');
  sendBtn.disabled = true;

  let fullText = '';

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-14)
    ];

    const gen = aiEngine === 'chrome'
      ? streamChromeAI(msg, systemPrompt)
      : streamPollinationsAI(messages, modelId);

    for await (const chunk of gen) {
      fullText += chunk;
      updateBubble(bubbleId, fullText);
    }

    finishBubble(bubbleId, fullText || '(pas de réponse)');
    if (fullText) chatHistory.push({ role: 'assistant', content: fullText });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  } catch (err) {
    finishBubble(bubbleId, `❌ Erreur : ${esc(err.message)}`);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

document.getElementById('btn-send-chat').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

document.getElementById('btn-clear-chat').addEventListener('click', () => {
  chatHistory = [];
  chromeAiSession = null;
  const c = document.getElementById('chat-messages');
  c.innerHTML = `<div class="chat-msg assistant"><span class="chat-avatar">🤖</span><div class="chat-bubble">Bonjour ! Je suis DevIA, ton assistant intégré. Pose-moi une question, colle du texte, ou utilise les boutons ci-dessous pour analyser la page courante.</div></div>`;
});

document.getElementById('btn-insert-page').addEventListener('click', async () => {
  const text = await getPageText();
  if (!text) return;
  const inp = document.getElementById('chat-input');
  inp.value = (inp.value ? inp.value + '\n\n' : '') + text.slice(0, 3000);
  inp.focus();
});

document.getElementById('btn-insert-selection').addEventListener('click', async () => {
  const text = await getSelectedText();
  if (!text) return;
  const inp = document.getElementById('chat-input');
  inp.value = (inp.value ? inp.value + '\n\n' : '') + text.slice(0, 3000);
  inp.focus();
});

// Check for right-click context menu pending selection
(function checkPendingSelection() {
  if (!chrome.storage.session) return;
  chrome.storage.session.get(['pendingSelection'], r => {
    if (!r.pendingSelection) return;
    chrome.storage.session.remove('pendingSelection');
    document.getElementById('chat-input').value = r.pendingSelection.slice(0, 3000);
    document.querySelector('.tab-btn[data-tab="ai"]').click();
  });
})();

// ── Calculator (safe recursive descent parser) ───────────────────────────────

function mathEval(expr) {
  expr = expr.replace(/\s/g, '').replace(/,/g, '.');
  let p = 0;
  const peek = () => expr[p];
  const eat = c => { if (expr[p] === c) { p++; return true; } return false; };

  function parseExpr() { return parseAddSub(); }
  function parseAddSub() {
    let v = parseMulDiv();
    while (p < expr.length && (peek() === '+' || peek() === '-'))
      v = peek() === '+' ? (p++, v + parseMulDiv()) : (p++, v - parseMulDiv());
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
    const base = parseUnary();
    if (peek() === '^') { p++; return Math.pow(base, parsePow()); }
    return base;
  }
  function parseUnary() {
    if (eat('-')) return -parsePrimary();
    eat('+');
    return parsePrimary();
  }
  function parsePrimary() {
    if (eat('(')) { const v = parseExpr(); eat(')'); return v; }
    const fnMatch = expr.slice(p).match(/^(sqrt|abs|round|floor|ceil|log|sin|cos|tan)\(/);
    if (fnMatch) { p += fnMatch[0].length; const arg = parseExpr(); eat(')'); return Math[fnMatch[1]](arg); }
    if (expr.slice(p, p + 2) === 'pi') { p += 2; return Math.PI; }
    if (expr[p] === 'e' && !/\d/.test(expr[p + 1] || '')) { p++; return Math.E; }
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
    calcResult.value = Number.isInteger(res) ? String(res) : parseFloat(res.toPrecision(12)).toString();
  } catch (e) { calcResult.value = `❌ ${e.message}`; }
}

document.getElementById('btn-calc').addEventListener('click', doCalc);
calcInput.addEventListener('keydown', e => { if (e.key === 'Enter') doCalc(); });
document.getElementById('btn-copy-calc').addEventListener('click', function () { copyText(calcResult.value, this); });

// ── Password Generator ───────────────────────────────────────────────────────

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
  const bar  = document.getElementById('pw-strength');
  const fill = document.getElementById('pw-strength-fill');
  bar.classList.remove('hidden');
  let s = 0;
  if (pw.length >= 8)         s++;
  if (pw.length >= 12)        s++;
  if (pw.length >= 16)        s++;
  if (/[A-Z]/.test(pw))      s++;
  if (/[a-z]/.test(pw))      s++;
  if (/[0-9]/.test(pw))      s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  fill.style.width      = `${Math.round((s / 7) * 100)}%`;
  fill.style.background = s <= 2 ? '#f87171' : s <= 4 ? '#fbbf24' : '#4ade80';
}

document.getElementById('btn-gen-pw').addEventListener('click', generatePassword);
document.getElementById('btn-copy-pw').addEventListener('click', function () { copyText(document.getElementById('pw-result').value, this); });
generatePassword();

// ── Color Converter ──────────────────────────────────────────────────────────

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
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
colorPicker.addEventListener('input', () => { colorHex.value = colorPicker.value; updateColorFromHex(colorPicker.value); });
colorHex.addEventListener('input',   () => updateColorFromHex(colorHex.value));
colorHex.value = '#6366f1';
updateColorFromHex('#6366f1');

document.getElementById('btn-copy-hex').addEventListener('click', function () { copyText(colorHex.value, this); });
document.getElementById('btn-copy-rgb').addEventListener('click', function () { copyText(document.getElementById('color-rgb').value, this); });
document.getElementById('btn-copy-hsl').addEventListener('click', function () { copyText(document.getElementById('color-hsl').value, this); });

// ── UUID Generator ───────────────────────────────────────────────────────────

document.getElementById('btn-gen-uuid').addEventListener('click', () => { document.getElementById('uuid-result').value = crypto.randomUUID(); });
document.getElementById('btn-copy-uuid').addEventListener('click', function () { copyText(document.getElementById('uuid-result').value, this); });
document.getElementById('uuid-result').value = crypto.randomUUID();

// ── SHA-256 Hash ─────────────────────────────────────────────────────────────

async function genHash() {
  const text = document.getElementById('hash-input').value;
  if (!text) { document.getElementById('hash-output').value = ''; return; }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  document.getElementById('hash-output').value = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

document.getElementById('btn-gen-hash').addEventListener('click', genHash);
document.getElementById('hash-input').addEventListener('keydown', e => { if (e.key === 'Enter') genHash(); });
document.getElementById('btn-copy-hash').addEventListener('click', function () { copyText(document.getElementById('hash-output').value, this); });

// ── Timestamp ────────────────────────────────────────────────────────────────

function updateTimestamp() {
  const raw = document.getElementById('ts-unix').value.trim();
  if (!raw) { document.getElementById('ts-date').value = ''; return; }
  const ts = parseInt(raw);
  if (isNaN(ts)) { document.getElementById('ts-date').value = '❌ Invalide'; return; }
  document.getElementById('ts-date').value = new Date(ts * 1000).toLocaleString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

document.getElementById('ts-unix').addEventListener('input', updateTimestamp);
document.getElementById('btn-ts-now').addEventListener('click', () => {
  document.getElementById('ts-unix').value = Math.floor(Date.now() / 1000);
  updateTimestamp();
});
document.getElementById('btn-copy-ts').addEventListener('click', function () { copyText(document.getElementById('ts-unix').value, this); });
document.getElementById('btn-ts-now').click();

// ── JSON / Base64 / URL ──────────────────────────────────────────────────────

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

// ── Dice Roller ──────────────────────────────────────────────────────────────

const diceHistory = [];

document.querySelectorAll('.dice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sides  = parseInt(btn.dataset.sides);
    const result = Math.floor(Math.random() * sides) + 1;
    const display = document.getElementById('dice-display');
    display.classList.remove('rolling');
    void display.offsetWidth;
    display.classList.add('rolling');
    display.textContent = result;
    display.style.color = result === 1 ? '#f87171' : result === sides ? '#fbbf24' : '#818cf8';
    diceHistory.unshift({ sides, result });
    if (diceHistory.length > 8) diceHistory.pop();
    document.getElementById('dice-history').innerHTML = diceHistory
      .map(d => `<span class="dice-chip"><span class="die-label">D${d.sides}</span> ${d.result}</span>`)
      .join('');
  });
});

// ── Server Status ────────────────────────────────────────────────────────────

const SERVERS = [
  { name: 'Steam',       icon: '🎮', url: 'https://store.steampowered.com/api/featured/',           parse: null },
  { name: 'Discord',     icon: '💬', url: 'https://discordstatus.com/api/v2/status.json',            parse: d => d?.status?.indicator === 'none' ? 'up' : 'down' },
  { name: 'Epic Games',  icon: '🎯', url: 'https://store.epicgames.com/',                            parse: null },
  { name: 'PlayStation', icon: '🕹', url: 'https://status.playstation.com/',                         parse: null },
  { name: 'Xbox Live',   icon: '🟩', url: 'https://xnotify.xboxlive.com/servicestatusv6/US/en-US',  parse: null }
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

// ── Steam Game Search ────────────────────────────────────────────────────────

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
      el.innerHTML = `<span class="game-name">${esc(game.name)}</span>${typeLabel ? `<span class="game-type">${esc(typeLabel)}</span>` : ''}<span class="game-id">${game.id}</span><span class="copied-badge">✓</span>`;
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

// ── Sites Manager ────────────────────────────────────────────────────────────

const SITES_KEY = 'devtoolkit-sites';
let allSites = [];
let editingSiteId = null;
let selectedColor = 'none';

function siteMatchesSearch(site, q) {
  return (site.title || '').toLowerCase().includes(q) ||
    (site.url || '').toLowerCase().includes(q) ||
    (site.desc || '').toLowerCase().includes(q) ||
    (site.tags || []).some(t => t.toLowerCase().includes(q));
}

function renderSites(list) {
  const container = document.getElementById('sites-list');
  if (!list.length) {
    container.innerHTML = '<div class="sites-empty">Aucun site sauvegardé.<br>Ajoutez un site avec les boutons ci-dessus !</div>';
    return;
  }
  container.innerHTML = list.map(site => {
    const domain = getDomain(site.url);
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32` : '';
    const tagsHtml = (site.tags || []).map(t => `<span class="site-tag">${esc(t)}</span>`).join('');
    const colorClass = site.color && site.color !== 'none' ? `color-${site.color}` : '';
    return `<div class="site-card ${colorClass}" data-id="${esc(site.id)}">
      <div class="site-card-header">
        ${faviconUrl ? `<img class="site-favicon" src="${esc(faviconUrl)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=site-favicon-placeholder>🌐</span>'">` : '<span class="site-favicon-placeholder">🌐</span>'}
        <div class="site-info">
          <div class="site-title">${esc(site.title || domain)}</div>
          <div class="site-url">${esc(site.url.length > 50 ? site.url.slice(0, 47) + '…' : site.url)}</div>
        </div>
        <div class="site-actions-btns">
          <button class="site-edit-btn icon-sm" data-id="${esc(site.id)}" title="Modifier">✏️</button>
          <button class="site-del-btn icon-sm" data-id="${esc(site.id)}" title="Supprimer">✕</button>
        </div>
      </div>
      ${site.desc ? `<div class="site-desc">${esc(site.desc)}</div>` : ''}
      ${tagsHtml ? `<div class="site-tags">${tagsHtml}</div>` : ''}
      <div class="site-footer">
        <span class="site-clicks">👁 ${site.clicks || 0}</span>
        <span class="site-date">${new Date(site.addedAt).toLocaleDateString('fr-FR')}</span>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.site-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('site-del-btn') || e.target.classList.contains('site-edit-btn')) return;
      const site = allSites.find(s => s.id === card.dataset.id);
      if (!site) return;
      site.clicks = (site.clicks || 0) + 1;
      chrome.storage.local.set({ [SITES_KEY]: allSites });
      chrome.tabs.create({ url: site.url });
    });
  });

  container.querySelectorAll('.site-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      allSites = allSites.filter(s => s.id !== btn.dataset.id);
      chrome.storage.local.set({ [SITES_KEY]: allSites });
      const q = document.getElementById('sites-search').value.toLowerCase();
      renderSites(q ? allSites.filter(s => siteMatchesSearch(s, q)) : allSites);
    });
  });

  container.querySelectorAll('.site-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const site = allSites.find(s => s.id === btn.dataset.id);
      if (site) { editingSiteId = site.id; openSiteForm(site); }
    });
  });
}

function openSiteForm(data = {}) {
  document.getElementById('site-url').value   = data.url   || '';
  document.getElementById('site-title').value = data.title || '';
  document.getElementById('site-desc').value  = data.desc  || '';
  document.getElementById('site-tags').value  = (data.tags || []).join(', ');
  selectedColor = data.color || 'none';
  document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === selectedColor));
  document.getElementById('site-form').classList.remove('hidden');
  document.getElementById('btn-show-add-form').classList.add('hidden');
  document.getElementById('site-url').focus();
}

function closeSiteForm() {
  document.getElementById('site-form').classList.add('hidden');
  document.getElementById('btn-show-add-form').classList.remove('hidden');
  editingSiteId = null;
}

document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    selectedColor = dot.dataset.color;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === selectedColor));
  });
});

document.getElementById('btn-show-add-form').addEventListener('click', () => { editingSiteId = null; openSiteForm(); });
document.getElementById('btn-site-cancel').addEventListener('click', closeSiteForm);

document.getElementById('btn-site-save').addEventListener('click', async () => {
  const url   = document.getElementById('site-url').value.trim();
  if (!url) { document.getElementById('site-url').focus(); return; }
  const title = document.getElementById('site-title').value.trim();
  const desc  = document.getElementById('site-desc').value.trim();
  const tags  = document.getElementById('site-tags').value.split(',').map(t => t.trim()).filter(Boolean);

  if (editingSiteId) {
    const site = allSites.find(s => s.id === editingSiteId);
    if (site) { site.url = url; site.title = title || getDomain(url); site.desc = desc; site.tags = tags; site.color = selectedColor; }
  } else {
    allSites.unshift({ id: crypto.randomUUID(), url, title: title || getDomain(url), desc, tags, color: selectedColor, addedAt: Date.now(), clicks: 0 });
  }

  chrome.storage.local.set({ [SITES_KEY]: allSites });
  closeSiteForm();
  renderSites(allSites);
});

document.getElementById('btn-capture-page').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
    editingSiteId = null;
    openSiteForm({ url: tab.url, title: tab.title || '' });
  });
});

document.getElementById('sites-search').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderSites(q ? allSites.filter(s => siteMatchesSearch(s, q)) : allSites);
});

// ── Style / Theme Customization ──────────────────────────────────────────────

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;
    applyTheme(theme);
    chrome.storage.local.set({ 'devtoolkit-theme': theme, 'devtoolkit-accent': null });
    document.getElementById('custom-accent').value = '#6366f1';
  });
});

document.getElementById('custom-accent').addEventListener('input', function () {
  document.documentElement.style.setProperty('--accent', this.value);
  document.documentElement.style.setProperty('--accent-dim', this.value);
  chrome.storage.local.set({ 'devtoolkit-accent': this.value });
});

document.getElementById('font-size-range').addEventListener('input', function () {
  document.getElementById('font-size-val').textContent = `${this.value}px`;
  document.documentElement.style.setProperty('--font-size', `${this.value}px`);
  chrome.storage.local.set({ 'devtoolkit-font-size': this.value });
});

document.getElementById('popup-width-range').addEventListener('input', function () {
  document.getElementById('popup-width-val').textContent = `${this.value}px`;
  document.documentElement.style.setProperty('--popup-width', `${this.value}px`);
  chrome.storage.local.set({ 'devtoolkit-popup-width': this.value });
});

document.getElementById('toggle-anim').addEventListener('change', function () {
  document.body.classList.toggle('no-anim', !this.checked);
  chrome.storage.local.set({ 'devtoolkit-anim': this.checked });
});

// ── Timer (chrome.alarms for background notification) ───────────────────────

const timerDisplay = document.getElementById('timer-display');
let timerInterval  = null;
let timerEndTs     = 0;
let timerRunning   = false;

function formatHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
    clearInterval(timerInterval); timerInterval = null; timerRunning = false;
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
  timerEndTs = Date.now() + total * 1000;
  timerRunning = true;
  timerDisplay.classList.remove('done', 'danger');
  hideStatus('timer-status');
  if (chrome.alarms) chrome.alarms.create('devtoolkit-timer', { delayInMinutes: total / 60 });
  clearInterval(timerInterval);
  timerTick();
  timerInterval = setInterval(timerTick, 500);
  document.getElementById('btn-timer-start').disabled = true;
  document.getElementById('btn-timer-pause').disabled = false;
});

document.getElementById('btn-timer-pause').addEventListener('click', () => {
  if (!timerInterval) return;
  clearInterval(timerInterval); timerInterval = null; timerRunning = false;
  chrome.alarms?.clear('devtoolkit-timer');
  document.getElementById('btn-timer-start').disabled = false;
  document.getElementById('btn-timer-pause').disabled = true;
});

document.getElementById('btn-timer-reset').addEventListener('click', () => {
  clearInterval(timerInterval); timerInterval = null; timerRunning = false;
  chrome.alarms?.clear('devtoolkit-timer');
  timerDisplay.textContent = formatHMS(getTimerSeconds());
  timerDisplay.classList.remove('done', 'danger');
  hideStatus('timer-status');
  document.getElementById('btn-timer-start').disabled = false;
  document.getElementById('btn-timer-pause').disabled = true;
});

['timer-h', 'timer-m', 'timer-s'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (!timerRunning) timerDisplay.textContent = formatHMS(getTimerSeconds());
  });
});
timerDisplay.textContent = formatHMS(getTimerSeconds());

// ── Stopwatch / Chrono ───────────────────────────────────────────────────────

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
  const lapTime = chronoElapsed - lastLapTime;
  lastLapTime = chronoElapsed;
  const lapsEl = document.getElementById('chrono-laps');
  const item = document.createElement('div');
  item.className = 'lap-item';
  item.innerHTML = `<span class="lap-num">Lap ${lapCount}</span><span>${formatChronoMs(chronoElapsed)}</span><span style="color:var(--muted)">+${formatChronoMs(lapTime)}</span>`;
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

// ── Notes ────────────────────────────────────────────────────────────────────

const notesArea  = document.getElementById('notes-area');
const notesSaved = document.getElementById('notes-saved');
let saveTimer    = null;

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

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const keys = [
    'devtoolkit-theme', 'devtoolkit-accent', 'devtoolkit-font-size',
    'devtoolkit-popup-width', 'devtoolkit-anim', 'quickNotes', SITES_KEY
  ];
  const prefs = await new Promise(resolve => chrome.storage.local.get(keys, resolve));

  const theme = prefs['devtoolkit-theme'] || 'dark';
  applyTheme(theme, prefs['devtoolkit-accent'] || null);
  if (prefs['devtoolkit-accent']) document.getElementById('custom-accent').value = prefs['devtoolkit-accent'];

  const fontSize = prefs['devtoolkit-font-size'] || '14';
  document.getElementById('font-size-range').value = fontSize;
  document.getElementById('font-size-val').textContent = `${fontSize}px`;
  document.documentElement.style.setProperty('--font-size', `${fontSize}px`);

  const popupWidth = prefs['devtoolkit-popup-width'] || '420';
  document.getElementById('popup-width-range').value = popupWidth;
  document.getElementById('popup-width-val').textContent = `${popupWidth}px`;
  document.documentElement.style.setProperty('--popup-width', `${popupWidth}px`);

  const animEnabled = prefs['devtoolkit-anim'] !== false;
  document.getElementById('toggle-anim').checked = animEnabled;
  document.body.classList.toggle('no-anim', !animEnabled);

  if (prefs.quickNotes) notesArea.value = prefs.quickNotes;

  allSites = prefs[SITES_KEY] || [];
  renderSites(allSites);

  await initAI();
}

init();
