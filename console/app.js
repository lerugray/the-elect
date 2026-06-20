// THE ELECT — Browser Console app.js
// Single-file behavior: voice picker, transcript, summoning loader,
// send/receive, localStorage persistence, copy, download .md, mock mode.
// Gateway contract: POST ${CONFIG.gatewayUrl}/chat → { text, model, display_name, tokens, elapsed_s }
// No external deps. No webfonts. No telemetry.

import { CONFIG } from './config.js';

/* ────────────────────────────────────────────
   CONSTANTS & STATE
──────────────────────────────────────────── */

const LS_KEY = 'elect-console.conversation';
const CHAR_LIMIT = 2000;
const CHAR_WARN  = 2000;

// Conversation is an array of { role:'operator'|'model', who, text, ts, mock? }
let conversation = [];
// Active voice entry from CONFIG.models
let activeVoice = CONFIG.models[0];
// Whether a request is in flight
let pending = false;
// Simulated cold-start (mock: first call is ~2.5s, subsequent ~0.8s)
let mockCallCount = 0;

/* ────────────────────────────────────────────
   DOM REFS
──────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);

const pickerRow     = $('#picker-row');
const disclaimerEl  = $('#disclaimer-text');
const transcriptEl  = $('#transcript');
const composerInput = $('#composer-input');
const sendBtn       = $('#send-btn');
const charCounter   = $('#char-counter');
const ctrlCopy      = $('#ctrl-copy');
const ctrlDownload  = $('#ctrl-download');
const ctrlNew       = $('#ctrl-new');

/* ────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────── */

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function scrollEnd() {
  requestAnimationFrame(() => {
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  });
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function nowTs() {
  return new Date().toISOString();
}

function formatTs(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/* ────────────────────────────────────────────
   VOICE PICKER
──────────────────────────────────────────── */

function buildPicker() {
  pickerRow.replaceChildren();
  for (const voice of CONFIG.models) {
    const chip = el('button', 'voice-chip');
    chip.type = 'button';
    chip.textContent = voice.display;
    chip.dataset.codename = voice.codename;
    // Pass the voice's hue as a CSS custom property for active border/color
    chip.style.setProperty('--chip-hue', voice.hue);
    chip.addEventListener('click', () => setActiveVoice(voice));
    pickerRow.appendChild(chip);
  }
  reflectActiveVoice();
}

function setActiveVoice(voice) {
  activeVoice = voice;
  reflectActiveVoice();
}

function reflectActiveVoice() {
  for (const chip of pickerRow.querySelectorAll('.voice-chip')) {
    chip.classList.toggle('is-active', chip.dataset.codename === activeVoice.codename);
  }
  disclaimerEl.textContent =
    `A 7B model trained on ${activeVoice.figure}'s register. ` +
    `It confabulates names, dates, and quotes. Read it in character — ` +
    `nothing it says is real advice or doctrine.`;
  // Update composer placeholder
  composerInput.placeholder = `ask ${activeVoice.display}…`;
}

/* ────────────────────────────────────────────
   TRANSCRIPT RENDERING
──────────────────────────────────────────── */

function turnHead(who, hue, meta) {
  const head = el('div', 'turn-head');
  const dot = el('span', 'turn-dot');
  if (hue) dot.style.background = hue;
  head.appendChild(dot);
  const whoEl = el('span', 'turn-who', who);
  if (hue) whoEl.style.color = hue;
  head.appendChild(whoEl);
  if (meta) head.appendChild(el('span', 'turn-meta', `  ${meta}`));
  return head;
}

function appendOpTurn(entry) {
  const turn = el('div', 'turn turn--op');
  turn.appendChild(turnHead('OPERATOR', null, formatTs(entry.ts)));
  turn.appendChild(el('p', 'op-text', entry.text));
  transcriptEl.appendChild(turn);
  return turn;
}

function appendModelTurn(entry) {
  const voice = CONFIG.models.find(m => m.codename === entry.codename) || activeVoice;
  const hue = voice ? voice.hue : null;
  const turn = el('div', 'turn turn--model');
  if (hue) turn.style.setProperty('--voice-hue', hue);
  const metaParts = [formatTs(entry.ts)];
  if (entry.mock) metaParts.push('[mock]');
  turn.appendChild(turnHead(entry.who, hue, metaParts.join(' · ')));
  // Render paragraphs
  for (const para of (entry.text || '').split(/\n{2,}/)) {
    const t = para.trim();
    if (t) {
      const p = el('p', 'seg-p', t);
      turn.appendChild(p);
    }
  }
  transcriptEl.appendChild(turn);
  return turn;
}

function appendErrorTurn(who, hue, message) {
  const turn = el('div', 'turn turn--model');
  if (hue) turn.style.setProperty('--voice-hue', hue);
  turn.appendChild(turnHead(who, hue, formatTs(nowTs())));
  const box = el('div', 'turn-error-box');
  box.appendChild(el('div', 'turn-error-stamp', 'SUMMONS FAILED'));
  box.appendChild(el('div', 'turn-error-msg', message));
  turn.appendChild(box);
  transcriptEl.appendChild(turn);
  return turn;
}

/* ────────────────────────────────────────────
   SUMMONING LOADER (ASCII animation)
──────────────────────────────────────────── */

// Each frame is a single-line ASCII sigil. The animation cycles through them
// at ~6fps via requestAnimationFrame, building a breathing / flickering effect.
// The glow text-shadow is set to the active voice's hue.
const LOADER_FRAMES = [
  '  ✦  ·  ·  ·  ·  ·  ✦  ',
  '  ✦  ★  ·  ·  ·  ★  ✦  ',
  '  ✦  ★  ✶  ·  ✶  ★  ✦  ',
  '  ✦  ★  ✶  ✴  ✶  ★  ✦  ',
  '  ✦  ★  ✶  ✴  ✶  ★  ✦  ',
  '  ✦  ★  ✶  ·  ✶  ★  ✦  ',
  '  ✦  ★  ·  ·  ·  ★  ✦  ',
  '  ✦  ·  ·  ·  ·  ·  ✦  ',
  '  ·  ·  ·  ·  ·  ·  ·  ',
  '  ·  ·  ·  ·  ·  ·  ·  ',
];

let loaderWrap = null;
let loaderAnim = null;
let loaderFrame = 0;

function startLoader(who, hue, voiceName) {
  stopLoader();

  loaderWrap = el('div', 'loader-wrap');
  loaderWrap.id = 'active-loader';
  const whoRow = el('div', 'loader-who');
  const label = el('span', 'loader-label', who);
  if (hue) label.style.color = hue;
  whoRow.appendChild(label);
  const hint = el('span', 'loader-hint',
    `SUMMONING ${voiceName.toUpperCase()}… first call wakes the machine, ~30s`);
  whoRow.appendChild(hint);
  loaderWrap.appendChild(whoRow);

  const ascii = el('div', 'loader-ascii');
  if (hue) {
    ascii.style.color = hue;
    const rgb = hexToRgb(hue);
    ascii.style.textShadow = `0 0 10px rgba(${rgb}, 0.6), 0 0 20px rgba(${rgb}, 0.3)`;
  }
  loaderWrap.appendChild(ascii);

  transcriptEl.appendChild(loaderWrap);
  scrollEnd();

  const FRAME_MS = 165; // ~6fps
  let last = 0;
  loaderFrame = 0;

  function tick(ts) {
    if (!loaderWrap || !loaderWrap.isConnected) return;
    if (ts - last >= FRAME_MS) {
      ascii.textContent = LOADER_FRAMES[loaderFrame % LOADER_FRAMES.length];
      loaderFrame++;
      last = ts;
    }
    loaderAnim = requestAnimationFrame(tick);
  }
  loaderAnim = requestAnimationFrame(tick);
}

function stopLoader() {
  if (loaderAnim) {
    cancelAnimationFrame(loaderAnim);
    loaderAnim = null;
  }
  if (loaderWrap) {
    loaderWrap.remove();
    loaderWrap = null;
  }
}

/* ────────────────────────────────────────────
   MOCK RESPONSES
──────────────────────────────────────────── */

const MOCK_STUBS = {
  'the-galilean':
    'Consider the lilies — they neither toil nor spin, yet they are clothed in greater glory than Solomon. ' +
    'The kingdom is not a reward deferred; it is already among you, if you have eyes to see it.',
  'den-of-thieves':
    'You have made this house a den of thieves. The poor at the gate go without, while the merchants count their gain inside. ' +
    'Overturn the tables. The first shall be last, and the last shall be first — this is not a promise for the afterlife.',
  'muntzergeist':
    'The living God sharpens his scythe in me, that the godless rulers who have made the Word a thing to be bought may be cut down. ' +
    'Do not prattle that the hour is not ripe: the harvest is come, and the tares are already bound for the fire.',
  'spectre':
    'The history of all hitherto existing society is the history of class struggles. ' +
    'Your question cannot be answered honestly without first naming who owns the conditions under which you ask it.',
  'osawatomie':
    'I, John Brown, am now quite certain that the crimes of this guilty land will never be purged away but with blood. ' +
    'God has not appointed us to spectate. Action is the sermon.',
  'north-star':
    'Power concedes nothing without a demand. It never did and it never will. ' +
    'Find out just what any people will quietly submit to and you have found out the exact measure of injustice and wrong which will be imposed upon them.',
};

function mockResponse(voice) {
  const delay = mockCallCount === 0 ? 2500 : 800;
  mockCallCount++;
  return new Promise((resolve) =>
    setTimeout(() => {
      resolve({
        text: MOCK_STUBS[voice.codename] ||
          `${voice.display} speaks here. (No mock stub defined for this voice.)`,
        model: voice.codename,
        display_name: voice.display,
        tokens: 64,
        elapsed_s: delay / 1000,
        _mock: true,
      });
    }, delay)
  );
}

/* ────────────────────────────────────────────
   GATEWAY TRANSPORT
──────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Submit the prompt to the gateway, then poll until the reply is ready.
// The gateway forwards to a scale-to-zero GPU, so the first call after idle
// is a cold start (tens of seconds; a never-seen voice downloads its weights
// on first use). The summoning loader stays up in the caller throughout.
async function callGateway(voice, prompt) {
  if (CONFIG.mock || !CONFIG.gatewayUrl) {
    return mockResponse(voice);
  }
  const base = CONFIG.gatewayUrl.replace(/\/+$/, '');

  // 1) submit
  let res, data;
  try {
    res = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: voice.codename,
        prompt,
        max_tokens: Math.min(CONFIG.defaultMaxTokens, 512),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    throw new Error('The lab is unreachable right now — try again shortly.');
  }
  if (!res.ok || !data || !data.job_id) {
    throw new Error((data && data.error) ? data.error : `Could not start the voice (HTTP ${res.status}).`);
  }

  // 2) poll until done (loader held by the caller)
  const jobId = data.job_id;
  const deadline = Date.now() + 180_000; // up to ~3 min for a first-ever cold download
  while (Date.now() < deadline) {
    await sleep(2500);
    let pdata;
    try {
      const pr = await fetch(`${base}/poll?id=${encodeURIComponent(jobId)}`, { signal: AbortSignal.timeout(20_000) });
      pdata = await pr.json().catch(() => null);
    } catch {
      continue; // transient — keep polling
    }
    if (!pdata) continue;
    if (pdata.done) {
      if (pdata.error) throw new Error(pdata.error);
      return pdata; // { text, model, display_name, tokens, elapsed_s }
    }
    // still warming / in progress — keep the summoning loader up
  }
  throw new Error('The voice is still waking — give it a moment and try again.');
}

/* ────────────────────────────────────────────
   SEND HANDLER
──────────────────────────────────────────── */

async function send() {
  const text = composerInput.value.trim();
  if (!text || pending) return;

  pending = true;
  setSendState(true);
  composerInput.value = '';
  updateCharCounter();

  const voice = activeVoice;
  const ts = nowTs();

  // Append operator turn
  const opEntry = { role: 'operator', who: 'OPERATOR', text, ts };
  conversation.push(opEntry);
  appendOpTurn(opEntry);
  persist();

  // Start the summoning loader
  startLoader(voice.display.toUpperCase(), voice.hue, voice.display);
  scrollEnd();

  let data;
  try {
    data = await callGateway(voice, text);
  } catch (e) {
    stopLoader();
    appendErrorTurn(voice.display.toUpperCase(), voice.hue, e.message);
    scrollEnd();
    pending = false;
    setSendState(false);
    return;
  }

  stopLoader();

  const responseText = (data && data.text) ? data.text : '';
  const isMock = !!(data && data._mock);

  const modelEntry = {
    role: 'model',
    who: voice.display.toUpperCase(),
    codename: voice.codename,
    text: responseText || '(empty response)',
    ts: nowTs(),
    mock: isMock,
  };
  conversation.push(modelEntry);
  appendModelTurn(modelEntry);
  persist();
  scrollEnd();

  pending = false;
  setSendState(false);
}

function setSendState(inFlight) {
  sendBtn.disabled = inFlight;
  sendBtn.textContent = inFlight ? 'SUMMONING…' : 'SUMMON';
}

/* ────────────────────────────────────────────
   LOCALSTORAGE PERSISTENCE
──────────────────────────────────────────── */

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(conversation));
  } catch { /* quota exceeded or blocked */ }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    conversation = arr;
    // Re-render all turns
    for (const entry of conversation) {
      if (entry.role === 'operator') appendOpTurn(entry);
      else if (entry.role === 'model') appendModelTurn(entry);
    }
    if (conversation.length) {
      hideEmpty();
      scrollEnd();
    }
  } catch { /* corrupt storage; ignore */ }
}

function clearConversation() {
  conversation = [];
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  transcriptEl.replaceChildren();
  showEmpty();
}

/* ────────────────────────────────────────────
   EMPTY STATE
──────────────────────────────────────────── */

let emptyEl = null;

function showEmpty() {
  if (!emptyEl || !transcriptEl.contains(emptyEl)) {
    emptyEl = el('div', 'transcript-empty');
    emptyEl.id = 'transcript-empty';
    emptyEl.textContent = 'Select a voice above. Ask a question. It answers in character.';
    transcriptEl.appendChild(emptyEl);
  }
}

function hideEmpty() {
  if (emptyEl && transcriptEl.contains(emptyEl)) {
    emptyEl.remove();
    emptyEl = null;
  }
}

// Hide empty when a turn is added
const origAppendOpTurn = appendOpTurn;
const origAppendModelTurn = appendModelTurn;

// Wrap to auto-hide empty state
function wrappedAppendOpTurn(entry) {
  hideEmpty();
  return origAppendOpTurn(entry);
}
function wrappedAppendModelTurn(entry) {
  hideEmpty();
  return origAppendModelTurn(entry);
}

/* ────────────────────────────────────────────
   COPY + DOWNLOAD
──────────────────────────────────────────── */

function buildMarkdown() {
  const lines = [];
  lines.push('# THE ELECT — Console Transcript');
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push('');
  for (const entry of conversation) {
    const who = entry.role === 'operator' ? 'OPERATOR' : entry.who;
    const ts = formatTs(entry.ts);
    const mockTag = entry.mock ? ' [mock]' : '';
    lines.push(`## ${who}${mockTag}  ${ts}`);
    lines.push('');
    lines.push(entry.text || '');
    lines.push('');
  }
  return lines.join('\n');
}

ctrlCopy.addEventListener('click', async () => {
  if (!conversation.length) return;
  try {
    await navigator.clipboard.writeText(buildMarkdown());
    const prev = ctrlCopy.textContent;
    ctrlCopy.textContent = 'COPIED';
    setTimeout(() => { ctrlCopy.textContent = prev; }, 1200);
  } catch {
    // Clipboard not available — silently ignore
  }
});

ctrlDownload.addEventListener('click', () => {
  if (!conversation.length) return;
  const md = buildMarkdown();
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `elect-console-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

ctrlNew.addEventListener('click', () => {
  if (conversation.length === 0) return;
  clearConversation();
  showEmpty();
});

/* ────────────────────────────────────────────
   CHAR COUNTER
──────────────────────────────────────────── */

function updateCharCounter() {
  const n = composerInput.value.length;
  charCounter.textContent = `${n} / ${CHAR_LIMIT}`;
  charCounter.classList.toggle('is-warn', n > CHAR_WARN);
}

composerInput.addEventListener('input', updateCharCounter);

/* ────────────────────────────────────────────
   COMPOSER KEYBOARD
──────────────────────────────────────────── */

composerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

sendBtn.addEventListener('click', send);

/* ────────────────────────────────────────────
   INIT
──────────────────────────────────────────── */

buildPicker();
showEmpty();
loadPersisted();
updateCharCounter();
