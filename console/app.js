// THE ELECT — Browser Console app.js
// Single-file behavior: voice picker, transcript, summoning loader,
// send/receive, localStorage persistence, copy, download .md, mock mode.
// Gateway contract: POST ${CONFIG.gatewayUrl}/chat → { text, model, display_name, tokens, elapsed_s }
// No external deps. No webfonts. No telemetry.

import { CONFIG, ENABLE_DONOR_UNLOCK } from './config.js';

/* ────────────────────────────────────────────
   CONSTANTS & STATE
──────────────────────────────────────────── */

const LS_KEY          = 'elect-console.conversation';
const LS_LENGTH_KEY   = 'elect-console.reply-length';
const LS_ARCHIVE_KEY  = 'elect-console.saved-chats';
const LS_DONOR_KEY    = 'elect-console.donor-unlocked';
const CHAR_LIMIT = 2000;
const CHAR_WARN  = 2000;

// Reply-length options: short / medium / long
const LENGTH_OPTIONS = {
  short:  { tokens: 130, hint: 'terse — a few sentences' },
  medium: { tokens: 350, hint: '' },
  long:   { tokens: 700, hint: 'long replies may take a moment' },
};
const LENGTH_DEFAULT = 'medium';
let activeLength = localStorage.getItem(LS_LENGTH_KEY) || LENGTH_DEFAULT;
if (!LENGTH_OPTIONS[activeLength]) activeLength = LENGTH_DEFAULT;

// Conversation is an array of { role:'operator'|'model', who, text, ts, mock? }
let conversation = [];
// Active voice entry from CONFIG.models (or CONFIG.modelsPatron when unlocked)
let activeVoice = null;
// Whether a request is in flight
let pending = false;
// Simulated cold-start (mock: first call is ~2.5s, subsequent ~0.8s)
let mockCallCount = 0;
// Donor unlock state (front-end only — optimistic until backend wires /verify-token)
let donorUnlocked = ENABLE_DONOR_UNLOCK && localStorage.getItem(LS_DONOR_KEY) === '1';

/* ────────────────────────────────────────────
   DOM REFS
──────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);

const pickerRow         = $('#picker-row');
const disclaimerEl      = $('#disclaimer-text');
const transcriptEl      = $('#transcript');
const composerInput     = $('#composer-input');
const sendBtn           = $('#send-btn');
const charCounter       = $('#char-counter');
const ctrlCopy          = $('#ctrl-copy');
const ctrlDownload      = $('#ctrl-download');
const ctrlImport        = $('#ctrl-import');
const ctrlSave          = $('#ctrl-save');
const ctrlNew           = $('#ctrl-new');
const importFileInput   = $('#import-file-input');
const lengthHintEl      = $('#length-hint');

// Archive DOM
const archiveSection    = $('#archive-section');
const archiveToggle     = $('#archive-toggle');
const archiveListWrap   = $('#archive-list-wrap');
const archiveList       = $('#archive-list');
const archiveEmpty      = $('#archive-empty');
const archiveCountBadge = $('#archive-count-badge');
const archiveToggleCaret= $('#archive-toggle-caret');

// Patron DOM
const patronRow         = $('#patron-row');
const patronUnlockForm  = $('#patron-unlock-form');
const patronTokenInput  = $('#patron-token-input');
const patronUnlockBtn   = $('#patron-unlock-btn');
const patronActiveRow   = $('#patron-active-row');
const patronLockBtn     = $('#patron-lock-btn');
const patronBadge       = $('#patron-badge');

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

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

/* ────────────────────────────────────────────
   ACTIVE MODEL LIST
   Returns patron list when unlocked + flag on, free list otherwise.
──────────────────────────────────────────── */

function activeModels() {
  if (ENABLE_DONOR_UNLOCK && donorUnlocked && CONFIG.modelsPatron) {
    return CONFIG.modelsPatron;
  }
  return CONFIG.models;
}

/* ────────────────────────────────────────────
   LENGTH PICKER
──────────────────────────────────────────── */

function buildLengthPicker() {
  const chips = document.querySelectorAll('.length-chip');
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      activeLength = chip.dataset.length;
      try { localStorage.setItem(LS_LENGTH_KEY, activeLength); } catch { /* quota */ }
      reflectActiveLength();
    });
  }
  reflectActiveLength();
}

function reflectActiveLength() {
  const chips = document.querySelectorAll('.length-chip');
  for (const chip of chips) {
    chip.classList.toggle('is-active', chip.dataset.length === activeLength);
  }
  if (lengthHintEl) {
    lengthHintEl.textContent = LENGTH_OPTIONS[activeLength]?.hint || '';
  }
}

/* ────────────────────────────────────────────
   VOICE PICKER
──────────────────────────────────────────── */

function buildPicker() {
  const models = activeModels();
  // Preserve active voice codename across rebuilds
  const prevCodename = activeVoice ? activeVoice.codename : null;
  pickerRow.replaceChildren();
  for (const voice of models) {
    const chip = el('button', 'voice-chip');
    chip.type = 'button';
    chip.textContent = voice.display;
    chip.dataset.codename = voice.codename;
    chip.style.setProperty('--chip-hue', voice.hue);
    chip.addEventListener('click', () => setActiveVoice(voice));
    pickerRow.appendChild(chip);
  }
  // Restore previous voice if still in list, else default to first
  const restored = prevCodename ? models.find(m => m.codename === prevCodename) : null;
  activeVoice = restored || models[0];
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
  composerInput.placeholder = `ask ${activeVoice.display}…`;
}

/* ────────────────────────────────────────────
   PATRON UNLOCK (ENABLE_DONOR_UNLOCK gate)
   All code in this block is a no-op when ENABLE_DONOR_UNLOCK = false.
──────────────────────────────────────────── */

function initPatronUI() {
  if (!ENABLE_DONOR_UNLOCK) return; // live console: nothing renders

  patronRow.hidden = false;
  reflectPatronState();

  // Unlock button handler
  patronUnlockBtn.addEventListener('click', () => attemptPatronUnlock());
  patronTokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptPatronUnlock();
  });

  // Lock button
  patronLockBtn.addEventListener('click', () => {
    donorUnlocked = false;
    try { localStorage.removeItem(LS_DONOR_KEY); } catch {}
    reflectPatronState();
    buildPicker(); // rebuild picker with free-tier models
  });
}

async function attemptPatronUnlock() {
  if (!ENABLE_DONOR_UNLOCK) return;
  const token = (patronTokenInput.value || '').trim();
  if (!token) return;

  // TODO: wire to /verify-token endpoint when backend deploys.
  // The gateway will respond { ok: true, tier: 'patron' } on a valid token.
  // For now, any non-empty token sets donorUnlocked (optimistic placeholder).
  // Replace this block with a real fetch call after running the deploy runbook:
  //   const res = await fetch(`${CONFIG.gatewayUrl}/verify-token?token=${encodeURIComponent(token)}`);
  //   const data = await res.json();
  //   if (!data.ok) { show error; return; }
  const unlocked = token.length > 0; // PLACEHOLDER — always true for any non-empty token
  // END TODO

  if (unlocked) {
    donorUnlocked = true;
    try { localStorage.setItem(LS_DONOR_KEY, '1'); } catch {}
    reflectPatronState();
    buildPicker(); // rebuild picker with full patron model list
  } else {
    patronTokenInput.style.borderColor = 'var(--red-bright)';
    setTimeout(() => { patronTokenInput.style.borderColor = ''; }, 1400);
  }
}

function reflectPatronState() {
  if (!ENABLE_DONOR_UNLOCK) return;
  if (donorUnlocked) {
    patronUnlockForm.hidden = true;
    patronActiveRow.hidden = false;
    if (patronBadge) patronBadge.hidden = false;
  } else {
    patronUnlockForm.hidden = false;
    patronActiveRow.hidden = true;
    if (patronBadge) patronBadge.hidden = true;
    patronTokenInput.value = '';
  }
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
  hideEmpty();
  const turn = el('div', 'turn turn--op');
  turn.appendChild(turnHead('OPERATOR', null, formatTs(entry.ts)));
  turn.appendChild(el('p', 'op-text', entry.text));
  transcriptEl.appendChild(turn);
  return turn;
}

function appendModelTurn(entry) {
  hideEmpty();
  // Look up voice from the union of all models (free + patron) so loaded archives render correctly
  const allModels = [...CONFIG.models, ...(CONFIG.modelsPatron || [])];
  const voice = allModels.find(m => m.codename === entry.codename) || activeVoice;
  const hue = voice ? voice.hue : null;
  const turn = el('div', 'turn turn--model');
  if (hue) turn.style.setProperty('--voice-hue', hue);
  const metaParts = [formatTs(entry.ts)];
  if (entry.mock) metaParts.push('[mock]');
  turn.appendChild(turnHead(entry.who, hue, metaParts.join(' · ')));
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
    `SUMMONING ${voiceName.toUpperCase()}… the first call wakes the machine — give it 1–3 minutes. Later summons are near-instant.`);
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
  const FRAME_MS = 165;
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
  if (loaderAnim) { cancelAnimationFrame(loaderAnim); loaderAnim = null; }
  if (loaderWrap) { loaderWrap.remove(); loaderWrap = null; }
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

async function callGateway(voice, prompt) {
  if (CONFIG.mock || !CONFIG.gatewayUrl) {
    return mockResponse(voice);
  }
  const base = CONFIG.gatewayUrl.replace(/\/+$/, '');
  let res, data;
  try {
    res = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: voice.codename,
        prompt,
        max_tokens: LENGTH_OPTIONS[activeLength]?.tokens ?? LENGTH_OPTIONS[LENGTH_DEFAULT].tokens,
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
  const jobId = data.job_id;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(2500);
    let pdata;
    try {
      const pr = await fetch(`${base}/poll?id=${encodeURIComponent(jobId)}`, { signal: AbortSignal.timeout(20_000) });
      pdata = await pr.json().catch(() => null);
    } catch { continue; }
    if (!pdata) continue;
    if (pdata.done) {
      if (pdata.error) throw new Error(pdata.error);
      return pdata;
    }
  }
  throw new Error('The voice is still waking — give it a moment and try again.');
}

function tidyResponse(s) {
  if (!s) return s;
  const t = s.trimEnd();
  if (/[.!?…"''")\]]$/.test(t)) return t;
  let cut = -1;
  for (const ch of ['.', '!', '?', '…']) cut = Math.max(cut, t.lastIndexOf(ch));
  if (cut > t.length * 0.4) return t.slice(0, cut + 1).trimEnd() + ' …';
  return t + ' …';
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
  const opEntry = { role: 'operator', who: 'OPERATOR', text, ts };
  conversation.push(opEntry);
  appendOpTurn(opEntry);
  persist();
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
  const responseText = tidyResponse((data && data.text) ? data.text : '');
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
   LOCALSTORAGE PERSISTENCE (single current conversation)
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
    for (const entry of conversation) {
      if (entry.role === 'operator') appendOpTurn(entry);
      else if (entry.role === 'model') appendModelTurn(entry);
    }
    if (conversation.length) scrollEnd();
  } catch { /* corrupt storage; ignore */ }
}

function clearConversation() {
  conversation = [];
  try { localStorage.removeItem(LS_KEY); } catch {}
  transcriptEl.replaceChildren();
  showEmpty();
}

/* ────────────────────────────────────────────
   ARCHIVE (named saved conversations)
──────────────────────────────────────────── */

function loadArchive() {
  try {
    const raw = localStorage.getItem(LS_ARCHIVE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveArchive(entries) {
  try {
    localStorage.setItem(LS_ARCHIVE_KEY, JSON.stringify(entries));
  } catch { /* quota */ }
}

function saveConversationToArchive() {
  if (!conversation.length) return;
  const name = prompt('Save as (give this conversation a name):');
  if (!name || !name.trim()) return;
  const voices = [...new Set(conversation.filter(e => e.role === 'model').map(e => e.who))];
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    voices,
    savedAt: nowTs(),
    turns: JSON.parse(JSON.stringify(conversation)), // deep copy
  };
  const archive = loadArchive();
  archive.unshift(entry); // newest first
  saveArchive(archive);
  renderArchive();
  // Flash the SAVE button
  const prev = ctrlSave.textContent;
  ctrlSave.textContent = 'SAVED';
  setTimeout(() => { ctrlSave.textContent = prev; }, 1200);
}

function loadConversationFromArchive(entryId) {
  const archive = loadArchive();
  const entry = archive.find(e => e.id === entryId);
  if (!entry) return;
  conversation = JSON.parse(JSON.stringify(entry.turns));
  transcriptEl.replaceChildren();
  hideEmpty();
  for (const turn of conversation) {
    if (turn.role === 'operator') appendOpTurn(turn);
    else if (turn.role === 'model') appendModelTurn(turn);
  }
  persist();
  scrollEnd();
}

function deleteFromArchive(entryId) {
  const archive = loadArchive().filter(e => e.id !== entryId);
  saveArchive(archive);
  renderArchive();
}

function renderArchive() {
  const archive = loadArchive();
  // Update count badge
  if (archiveCountBadge) {
    archiveCountBadge.textContent = archive.length ? `(${archive.length})` : '';
  }
  if (!archiveList) return;
  archiveList.replaceChildren();
  if (!archive.length) {
    if (archiveEmpty) archiveEmpty.hidden = false;
    return;
  }
  if (archiveEmpty) archiveEmpty.hidden = true;
  for (const entry of archive) {
    const row = el('div', 'archive-entry');
    row.setAttribute('role', 'listitem');
    row.dataset.id = entry.id;
    const info = el('div', 'archive-entry-info');
    info.appendChild(el('span', 'archive-entry-name', entry.name));
    const meta = entry.voices.join(', ') + ' · ' + formatDate(entry.savedAt);
    info.appendChild(el('span', 'archive-entry-meta', meta));
    row.appendChild(info);
    const actions = el('div', 'archive-entry-actions');
    const loadBtn = el('button', 'archive-btn archive-btn--load', 'LOAD');
    loadBtn.type = 'button';
    loadBtn.title = 'Load this conversation into the transcript';
    loadBtn.addEventListener('click', () => loadConversationFromArchive(entry.id));
    const delBtn = el('button', 'archive-btn archive-btn--delete', 'DELETE');
    delBtn.type = 'button';
    delBtn.title = 'Permanently remove this saved conversation';
    delBtn.addEventListener('click', () => {
      if (confirm(`Delete "${entry.name}"?`)) deleteFromArchive(entry.id);
    });
    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);
    archiveList.appendChild(row);
  }
}

function initArchive() {
  if (!archiveToggle) return;
  archiveToggle.addEventListener('click', () => {
    const open = archiveListWrap && !archiveListWrap.hidden;
    if (archiveListWrap) archiveListWrap.hidden = open;
    archiveToggle.setAttribute('aria-expanded', String(!open));
    if (archiveToggleCaret) archiveToggleCaret.textContent = open ? '▸' : '▾';
    if (!open) renderArchive(); // refresh on open
  });
  renderArchive();
}

/* ────────────────────────────────────────────
   IMPORT .md
   Parses a file produced by buildMarkdown() back into conversation turns.
   Format: ## WHO  HH:MM\n\ntext\n\n## WHO2…
──────────────────────────────────────────── */

function importMarkdownFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const parsed = parseMarkdownTranscript(text);
      if (!parsed.length) {
        alert('Could not parse this file. Make sure it was exported from The Elect console.');
        return;
      }
      conversation = parsed;
      transcriptEl.replaceChildren();
      hideEmpty();
      for (const turn of conversation) {
        if (turn.role === 'operator') appendOpTurn(turn);
        else if (turn.role === 'model') appendModelTurn(turn);
      }
      persist();
      scrollEnd();
    } catch {
      alert('Import failed — the file may be corrupt or not an Elect transcript.');
    }
  };
  reader.readAsText(file);
}

function parseMarkdownTranscript(md) {
  // Split on ## headers: ## WHO  HH:MM
  const sections = md.split(/^## /m).slice(1); // drop preamble
  const turns = [];
  const allModels = [...CONFIG.models, ...(CONFIG.modelsPatron || [])];

  for (const section of sections) {
    const lines = section.split('\n');
    const header = lines[0] || '';
    // Header format: "WHO [mock]  HH:MM" or "WHO  HH:MM"
    const headerClean = header.replace(/\[mock\]/gi, '').trim();
    const who = headerClean.replace(/\s+\d{1,2}:\d{2}.*$/, '').trim();
    const isMock = /\[mock\]/i.test(header);
    const bodyLines = lines.slice(1).join('\n').trim();
    if (!who || !bodyLines) continue;

    const isOperator = who.toUpperCase() === 'OPERATOR';
    // Try to find matching voice entry
    const voiceEntry = allModels.find(
      m => m.display.toUpperCase() === who.toUpperCase()
    );

    turns.push({
      role: isOperator ? 'operator' : 'model',
      who: who.toUpperCase(),
      codename: voiceEntry ? voiceEntry.codename : who.toLowerCase().replace(/\s+/g, '-'),
      text: bodyLines,
      ts: nowTs(), // approximate — the .md format doesn't carry full ISO timestamps
      mock: isMock,
    });
  }
  return turns;
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
  } catch { /* clipboard not available */ }
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

ctrlImport.addEventListener('click', () => {
  importFileInput.value = '';
  importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) importMarkdownFile(file);
});

ctrlSave.addEventListener('click', () => {
  if (!conversation.length) return;
  saveConversationToArchive();
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

initPatronUI();   // no-op when ENABLE_DONOR_UNLOCK = false
buildPicker();
buildLengthPicker();
showEmpty();
loadPersisted();
initArchive();
updateCharCounter();
