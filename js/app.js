/* ================================================================
   Journal — app.js
   Same architecture as CheckCheck: localStorage-backed with
   Firebase Auth (Google Sign-In) + Firestore sync. All state,
   storage, rendering, and event handling in one file.
================================================================ */

'use strict';

// ─── FIREBASE (reuses the same Firebase project as CheckCheck —
// same Google account, same Authentication setup, isolated under
// its own Firestore subcollection so it never touches CheckCheck data) ──
const _FB_CONFIG = {
  apiKey:            'AIzaSyBpUUVpBIsuKAx1Tw-cnN4ItXho7IqbMMQ',
  authDomain:        'checkcheck-3d35f.firebaseapp.com',
  projectId:         'checkcheck-3d35f',
  storageBucket:     'checkcheck-3d35f.firebasestorage.app',
  messagingSenderId: '744363444071',
  appId:             '1:744363444071:web:5e72bf03a2771ae83c91c2',
};
firebase.initializeApp(_FB_CONFIG);
const _fbAuth  = firebase.auth();
const _fbStore = firebase.firestore();
let   _fbUser  = null;
let   _syncState = 'offline'; // 'offline' | 'synced' | 'syncing'

function entriesCol() {
  return _fbStore.collection('users').doc(_fbUser.uid).collection('journalEntries');
}

async function fsSaveEntry(dateKey, entry) {
  if (!_fbUser) return;
  _syncState = 'syncing'; updateSyncDot();
  try {
    await entriesCol().doc(dateKey).set(entry);
    _syncState = 'synced';
  } catch (e) {
    console.warn('Firestore save failed:', e);
    _syncState = 'offline';
  }
  updateSyncDot();
}

async function fsDeleteEntry(dateKey) {
  if (!_fbUser) return;
  try { await entriesCol().doc(dateKey).delete(); }
  catch (e) { console.warn('Firestore delete failed:', e); }
}

async function fsPullAll() {
  if (!_fbUser) return;
  _syncState = 'syncing'; updateSyncDot();
  try {
    const snap = await entriesCol().get();
    if (!snap.empty) {
      snap.forEach(doc => { entries[doc.id] = doc.data(); });
      saveLocal();
    } else {
      // First-time migration: push any local entries up to the cloud
      const localKeys = Object.keys(entries);
      for (const k of localKeys) await fsSaveEntry(k, entries[k]);
    }
    _syncState = 'synced';
  } catch (e) {
    console.warn('Firestore pull failed:', e);
    _syncState = 'offline';
  }
  updateSyncDot();
}

function updateSyncDot() {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  dot.className = 'sync-dot' + (_syncState === 'syncing' ? ' syncing' : _syncState === 'offline' ? ' offline' : '');
  dot.title = _syncState === 'syncing' ? 'Syncing…' : _syncState === 'offline' ? 'Offline — changes saved on this device' : 'Synced';
}

// ─── UTILITIES ───────────────────────────────────────────────────

const fmt = {
  full: key => new Date(key + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  short: key => new Date(key + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  time: ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function wordCount(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

// ─── LOCAL STORAGE ────────────────────────────────────────────────

const LS_KEY = 'jr_entries';
const THEME_KEY = 'jr_theme';

let entries = {};
function loadLocal() {
  try { entries = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { entries = {}; }
}
function saveLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

// ─── PROMPTS ──────────────────────────────────────────────────────

const PROMPTS = [
  "What's one thing that made you smile today?",
  "What's weighing on your mind right now?",
  "Describe a small win from today.",
  "What are you grateful for in this moment?",
  "What would make tomorrow feel like a good day?",
  "Write about a conversation that stuck with you today.",
  "What's something you're avoiding, and why?",
  "What did you learn about yourself this week?",
  "Describe your energy today in three words, then explain.",
  "What's one thing you'd tell your morning self?",
  "What are you looking forward to?",
  "What's a fear you can name out loud right now?",
  "Who or what supported you today?",
  "What did you do today that felt like 'you'?",
  "What's a thought you keep circling back to?",
  "If today had a title, what would it be?",
  "What's something you need to let go of?",
  "Describe a moment of calm from today.",
  "What's a boundary you held (or wish you'd held) today?",
  "What's one thing your body is telling you right now?",
  "What surprised you today?",
  "What's something you're proud of, even if small?",
  "Write a note to your future self one year from now.",
  "What pattern have you noticed in yourself lately?",
  "What does rest look like for you right now?",
  "What's a question you don't have the answer to yet?",
  "Who do you want to reach out to, and why haven't you?",
  "What's one thing you can simplify in your life?",
  "Describe today using only the weather as a metaphor.",
  "What's something you did for someone else today?",
];

const MOODS = [
  { v: 1, e: '😔', l: 'Rough', color: '#EF4444' },
  { v: 2, e: '😕', l: 'Low',   color: '#F59E0B' },
  { v: 3, e: '😐', l: 'Okay',  color: '#9CA3AF' },
  { v: 4, e: '🙂', l: 'Good',  color: '#6EE7B7' },
  { v: 5, e: '😄', l: 'Great', color: '#10B981' },
];
function moodInfo(v) { return MOODS.find(m => m.v === v); }
function promptForDate(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % PROMPTS.length;
}

// ─── STATE ────────────────────────────────────────────────────────

const state = {
  view: 'today',           // 'today' | 'history' | 'calendar' | 'insights' | 'settings'
  composerDate: todayKey(), // which date the composer is currently editing
  draftMood: null,
  draftTags: [],
  draftPromptIndex: null,
  draftPhoto: null,
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  historySearch: '',
  historyMoodFilter: '',
};

// ─── IMAGE COMPRESSION ──────────────────────────────────────────

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let quality = 0.78;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 380000 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── STREAKS ──────────────────────────────────────────────────────

function computeStreaks() {
  const keys = Object.keys(entries).sort();
  if (keys.length === 0) return { current: 0, longest: 0 };
  const keySet = new Set(keys);
  let longest = 0, run = 0, prevDate = null;
  keys.forEach(k => {
    const d = new Date(k + 'T00:00:00');
    run = prevDate && Math.round((d - prevDate) / 86400000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prevDate = d;
  });
  let current = 0;
  let cursor = new Date();
  if (!keySet.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (keySet.has(dateKey(cursor))) { current++; cursor.setDate(cursor.getDate() - 1); }
  return { current, longest };
}

// ─── RENDER DISPATCH ────────────────────────────────────────────

const main = () => document.getElementById('main-content');

function render() {
  syncTabs();
  if (state.view === 'today')    renderToday();
  if (state.view === 'history')  renderHistory();
  if (state.view === 'calendar') renderCalendarView();
  if (state.view === 'insights') renderInsights();
  if (state.view === 'settings') renderSettings();
  updateStreakPill();
}

function syncTabs() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
}

function updateStreakPill() {
  const { current } = computeStreaks();
  const pill = document.getElementById('streak-pill');
  if (pill) pill.innerHTML = '🔥 <span>' + current + '</span> <span class="streak-label">day streak</span>';
}

// ─── TODAY VIEW ───────────────────────────────────────────────────

function loadDraftFromEntry(key) {
  const e = entries[key];
  if (e) {
    state.draftMood = e.mood;
    state.draftTags = (e.tags || []).slice();
    state.draftPromptIndex = e.promptIndex != null ? e.promptIndex : promptForDate(key);
    state.draftPhoto = e.photo || null;
  } else {
    state.draftMood = null;
    state.draftTags = [];
    state.draftPromptIndex = promptForDate(key);
    state.draftPhoto = null;
  }
}

function onThisDayEntries() {
  const now = new Date();
  const results = [];
  for (let yearsBack = 1; yearsBack <= 8; yearsBack++) {
    const d = new Date(now.getFullYear() - yearsBack, now.getMonth(), now.getDate());
    const key = dateKey(d);
    if (entries[key]) results.push({ key, entry: entries[key], yearsBack });
  }
  return results;
}

function renderToday() {
  const key = state.composerDate;
  const isToday = key === todayKey();
  loadDraftFromEntry(key);
  const existing = entries[key];
  const { current, longest } = computeStreaks();
  const total = Object.keys(entries).length;
  const otd = isToday ? onThisDayEntries() : [];

  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        ${!isToday ? `<button class="back-btn" id="back-to-today"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Back to today</button>` : ''}
        <div class="page-title">${isToday ? 'Today' : 'Editing entry'}</div>
        <div class="page-subtitle">${fmt.full(key)}</div>
      </div>
    </div>

    <div class="two-col">
      <div>
        <div class="card">
          <div class="prompt-card">
            <span id="prompt-text">${escHtml(PROMPTS[state.draftPromptIndex])}</span>
            <button id="shuffle-prompt" title="New prompt">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
            </button>
          </div>

          <div class="mood-picker" id="mood-picker">
            ${MOODS.map(m => `<button class="mood-opt${state.draftMood === m.v ? ' selected' : ''}" data-mood="${m.v}">${m.e}<span>${m.l}</span></button>`).join('')}
          </div>

          <textarea class="composer-textarea" id="entry-text" placeholder="Write freely… what's on your mind today?">${escHtml(existing ? existing.text : '')}</textarea>

          <div class="tag-row" id="tag-row">
            ${state.draftTags.map(t => `<span class="tag-chip">#${escHtml(t)}<button data-remove-tag="${escHtml(t)}">×</button></span>`).join('')}
            <input type="text" class="tag-input" id="tag-input" placeholder="Add a tag, press Enter">
          </div>

          <div class="photo-row" id="photo-row">
            ${state.draftPhoto
              ? `<div class="photo-preview"><img src="${state.draftPhoto}"><button class="photo-remove-btn" id="remove-photo">×</button></div>`
              : `<label class="photo-attach-btn">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                   Add a photo
                   <input type="file" accept="image/*" id="photo-input" style="display:none">
                 </label>`}
          </div>

          <div class="save-row">
            <span class="save-status" id="save-status">${existing ? 'Saved at ' + fmt.time(existing.updatedAt) : 'Not saved yet'}</span>
            <button class="btn-primary" id="save-entry-btn">Save entry</button>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header"><span class="card-title">This week</span></div>
          <div class="stats-row">
            <div class="stat-card"><div class="stat-value">${current}</div><div class="stat-label">Streak</div></div>
            <div class="stat-card"><div class="stat-value">${longest}</div><div class="stat-label">Longest</div></div>
            <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Entries</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Last 20 days</span></div>
          <div class="calendar-grid" id="mini-heatmap"></div>
        </div>

        ${otd.length > 0 ? `
          <div class="card">
            <div class="card-header"><span class="card-title">On this day</span></div>
            ${otd.map(o => `
              <div class="otd-entry">
                <div class="otd-year">${o.yearsBack} year${o.yearsBack > 1 ? 's' : ''} ago ${moodInfo(o.entry.mood) ? moodInfo(o.entry.mood).e : ''}</div>
                <div class="otd-text">${escHtml(o.entry.text || '(no text)')}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  buildHeatmap(document.getElementById('mini-heatmap'), 20);

  document.querySelectorAll('#mood-picker .mood-opt').forEach(btn => {
    btn.onclick = () => { state.draftMood = Number(btn.dataset.mood); renderToday(); };
  });

  document.getElementById('shuffle-prompt').onclick = () => {
    let idx;
    do { idx = Math.floor(Math.random() * PROMPTS.length); } while (idx === state.draftPromptIndex && PROMPTS.length > 1);
    state.draftPromptIndex = idx;
    document.getElementById('prompt-text').textContent = PROMPTS[idx];
  };

  const tagInput = document.getElementById('tag-input');
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = tagInput.value.trim().replace(/^#/, '');
      if (val && !state.draftTags.includes(val)) { state.draftTags.push(val); renderToday(); document.getElementById('tag-input').focus(); }
      else tagInput.value = '';
    }
  });
  document.querySelectorAll('[data-remove-tag]').forEach(btn => {
    btn.onclick = () => { state.draftTags = state.draftTags.filter(t => t !== btn.dataset.removeTag); renderToday(); };
  });

  const photoInput = document.getElementById('photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      if (!file) return;
      const dataUrl = await compressImage(file);
      state.draftPhoto = dataUrl;
      renderToday();
    });
  }
  const removePhotoBtn = document.getElementById('remove-photo');
  if (removePhotoBtn) removePhotoBtn.onclick = () => { state.draftPhoto = null; renderToday(); };

  document.getElementById('save-entry-btn').onclick = () => saveTodayEntry();
  const backBtn = document.getElementById('back-to-today');
  if (backBtn) backBtn.onclick = () => { state.composerDate = todayKey(); renderToday(); };
}

function saveTodayEntry() {
  const key = state.composerDate;
  const text = document.getElementById('entry-text').value.trim();
  if (!state.draftMood && !text && !state.draftPhoto) {
    document.getElementById('save-status').textContent = 'Add a mood, photo, or a few words first';
    return;
  }
  const entry = {
    date: key,
    mood: state.draftMood,
    text,
    tags: state.draftTags.slice(),
    promptIndex: state.draftPromptIndex,
    photo: state.draftPhoto,
    updatedAt: Date.now(),
  };
  entries[key] = entry;
  saveLocal();
  fsSaveEntry(key, entry);
  render();
}

// ─── HEATMAP (shared component) ─────────────────────────────────

function buildHeatmap(container, days) {
  if (!container) return;
  container.innerHTML = '';
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.dataset.tooltip = fmt.short(key);
    const e = entries[key];
    if (e) {
      const mi = moodInfo(e.mood);
      cell.style.background = mi ? mi.color : 'var(--accent)';
    }
    container.appendChild(cell);
  }
}

// ─── HISTORY VIEW ─────────────────────────────────────────────────

function renderHistory() {
  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">History</div>
        <div class="page-subtitle">${Object.keys(entries).length} entries</div>
      </div>
    </div>
    <div class="card">
      <div class="search-row">
        <input type="text" class="form-input" id="search-input" placeholder="Search entries and tags…" value="${escHtml(state.historySearch)}">
        <select class="form-input" id="mood-filter" style="max-width:160px">
          <option value="">All moods</option>
          ${MOODS.map(m => `<option value="${m.v}" ${state.historyMoodFilter === String(m.v) ? 'selected' : ''}>${m.e} ${m.l}</option>`).join('')}
        </select>
      </div>
      <div id="entry-list"></div>
    </div>
  `;
  renderEntryList();

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => { state.historySearch = searchInput.value; renderEntryList(); });
  const moodFilter = document.getElementById('mood-filter');
  moodFilter.addEventListener('change', () => { state.historyMoodFilter = moodFilter.value; renderEntryList(); });
}

function renderEntryList() {
  const list = document.getElementById('entry-list');
  const search = state.historySearch.toLowerCase();
  const keys = Object.keys(entries).sort().reverse();
  const rows = [];
  keys.forEach(key => {
    const e = entries[key];
    if (state.historyMoodFilter && String(e.mood) !== state.historyMoodFilter) return;
    const haystack = (e.text || '') + ' ' + (e.tags || []).join(' ');
    if (search && !haystack.toLowerCase().includes(search)) return;
    rows.push(entryRowHTML(key, e));
  });
  list.innerHTML = rows.length
    ? rows.join('')
    : `<div class="empty-state"><div class="empty-state-icon">📖</div><p>No entries found.</p></div>`;

  document.querySelectorAll('[data-open-entry]').forEach(row => {
    row.onclick = () => openEntryModal(row.dataset.openEntry);
  });
}

function entryRowHTML(key, e) {
  const mi = moodInfo(e.mood);
  const thumb = e.photo
    ? `<img class="entry-thumb" src="${e.photo}">`
    : `<div class="entry-mood-badge">${mi ? mi.e : '📝'}</div>`;
  return `
    <div class="entry-row" data-open-entry="${key}">
      ${thumb}
      <div class="entry-body">
        <div class="entry-head">
          <span class="entry-date">${fmt.full(key)}</span>
          <span class="entry-wordcount">${wordCount(e.text)} words</span>
        </div>
        <div class="entry-preview">${escHtml(e.text || '(no text)')}</div>
        <div class="entry-tags">${(e.tags || []).map(t => `<span class="tag-chip">#${escHtml(t)}</span>`).join('')}</div>
      </div>
    </div>
  `;
}

function openEntryModal(key) {
  const e = entries[key];
  if (!e) return;
  const mi = moodInfo(e.mood);
  document.getElementById('modal-title').textContent = fmt.full(key);
  document.getElementById('modal-body').innerHTML = `
    ${mi ? `<div style="font-size:2rem;margin-bottom:10px">${mi.e} <span style="font-size:.85rem;color:var(--text-2);font-weight:600">${mi.l}</span></div>` : ''}
    ${e.photo ? `<img src="${e.photo}" style="width:100%;border-radius:var(--radius-md);margin-bottom:14px;border:1px solid var(--border-light)">` : ''}
    <div style="white-space:pre-wrap;font-size:.9rem;line-height:1.6;color:var(--text-1)">${escHtml(e.text || '(no text)')}</div>
    ${(e.tags || []).length ? `<div class="tag-row" style="margin-top:14px">${e.tags.map(t => `<span class="tag-chip">#${escHtml(t)}</span>`).join('')}</div>` : ''}
    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn-secondary" id="modal-edit-btn">Edit</button>
      <button class="btn-danger-outline" id="modal-delete-btn">Delete</button>
    </div>
  `;
  openModal();
  document.getElementById('modal-edit-btn').onclick = () => {
    closeModal();
    state.view = 'today';
    state.composerDate = key;
    render();
  };
  document.getElementById('modal-delete-btn').onclick = () => {
    if (confirm('Delete this entry? This cannot be undone.')) {
      delete entries[key];
      saveLocal();
      fsDeleteEntry(key);
      closeModal();
      render();
    }
  };
}

// ─── CALENDAR VIEW ──────────────────────────────────────────────

function renderCalendarView() {
  const year = state.calYear, month = state.calMonth;
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const now = new Date();
  const isCurrent = month === now.getMonth() && year === now.getFullYear();

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Calendar</div>
        <div class="page-subtitle">Browse entries by day</div>
      </div>
    </div>
    <div class="card">
      <div class="month-nav">
        <button class="month-nav-btn" id="prev-month"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span class="month-label">${monthName}</span>
        <button class="month-nav-btn" id="next-month" ${isCurrent ? 'disabled' : ''}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div class="month-cal-grid">
        ${['S','M','T','W','T','F','S'].map(d => `<div class="month-cal-hdr">${d}</div>`).join('')}
        ${Array.from({ length: startOffset }).map(() => `<div class="month-cal-cell empty"></div>`).join('')}
        ${Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const d = new Date(year, month, day);
          const key = dateKey(d);
          const e = entries[key];
          const mi = e ? moodInfo(e.mood) : null;
          const isToday = key === todayKey();
          const style = mi ? `background:${mi.color};color:#fff;` : (e ? 'background:var(--accent);color:#fff;' : '');
          return `<div class="month-cal-cell${e ? ' has-entry' : ''}${isToday ? ' today' : ''}" style="${style}" ${e ? `data-open-entry="${key}"` : ''}>
            <span>${day}</span>${mi ? `<span class="mcc-emoji">${mi.e}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('prev-month').onclick = () => {
    if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; } else state.calMonth--;
    renderCalendarView();
  };
  document.getElementById('next-month').onclick = () => {
    if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; } else state.calMonth++;
    renderCalendarView();
  };
  document.querySelectorAll('[data-open-entry]').forEach(cell => {
    cell.onclick = () => openEntryModal(cell.dataset.openEntry);
  });
}

// ─── INSIGHTS VIEW ──────────────────────────────────────────────

function renderInsights() {
  const { current, longest } = computeStreaks();
  const keys = Object.keys(entries).sort();
  const today = new Date();
  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    last30.push(dateKey(d));
  }
  const moodVals = last30.map(k => entries[k] ? entries[k].mood : null);
  const validVals = moodVals.filter(v => v != null);
  const avg = validVals.length ? (validVals.reduce((a, b) => a + b, 0) / validVals.length).toFixed(1) : '—';

  const totalWords = keys.reduce((s, k) => s + wordCount(entries[k].text), 0);

  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Insights</div>
        <div class="page-subtitle">Patterns across your entries</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Overview</span></div>
      <div class="stats-row">
        <div class="stat-card"><div class="stat-value">${current}</div><div class="stat-label">Current streak</div></div>
        <div class="stat-card"><div class="stat-value">${longest}</div><div class="stat-label">Longest streak</div></div>
        <div class="stat-card"><div class="stat-value">${avg}</div><div class="stat-label">Avg mood (30d)</div></div>
      </div>
      <div class="stats-row" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-card"><div class="stat-value">${keys.length}</div><div class="stat-label">Total entries</div></div>
        <div class="stat-card"><div class="stat-value">${totalWords.toLocaleString()}</div><div class="stat-label">Words written</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Mood over last 30 days</span></div>
      <canvas id="mood-chart" height="160"></canvas>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Check-in history</span></div>
      <div id="year-graph"></div>
      <div class="yg2-legend">
        <span>Less</span>
        ${['#EF4444','#F59E0B','#9CA3AF','#6EE7B7','#10B981'].map(c => `<span class="yg2-cell" style="background:${c}"></span>`).join('')}
        <span>More</span>
      </div>
    </div>
  `;

  drawMoodChart(moodVals);
  buildYearGraph(document.getElementById('year-graph'));
}

function drawMoodChart(vals) {
  const canvas = document.getElementById('mood-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = 160;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = 16;
  const w = cssWidth - padding * 2;
  const h = cssHeight - padding * 2;
  const n = vals.length;
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#6366F1';
  const border = styles.getPropertyValue('--border-light').trim() || '#eee';

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  for (let m = 1; m <= 5; m++) {
    const y = padding + h - ((m - 1) / 4) * h;
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(padding + w, y); ctx.stroke();
  }

  ctx.beginPath();
  let started = false;
  vals.forEach((v, i) => {
    if (v == null) { started = false; return; }
    const x = padding + (i / (n - 1)) * w;
    const y = padding + h - ((v - 1) / 4) * h;
    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
  });
  ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

  vals.forEach((v, i) => {
    if (v == null) return;
    const x = padding + (i / (n - 1)) * w;
    const y = padding + h - ((v - 1) / 4) * h;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
  });
}

function buildYearGraph(container) {
  if (!container) return;
  container.innerHTML = '';
  const outer = document.createElement('div');
  outer.className = 'yg2-outer';

  const dayLabels = document.createElement('div');
  dayLabels.className = 'yg2-daylabels';
  dayLabels.innerHTML = '<div class="yg2-name-spacer"></div>' +
    ['S','M','T','W','T','F','S'].map(d => `<div class="yg2-daylbl">${d}</div>`).join('');
  outer.appendChild(dayLabels);

  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() - 364);
  // align to the previous Sunday
  start.setDate(start.getDate() - start.getDay());

  const months = [];
  let cursor = new Date(start);
  let curMonthBlock = null;
  while (cursor <= today) {
    const monthKey = cursor.getFullYear() + '-' + cursor.getMonth();
    if (!curMonthBlock || curMonthBlock.key !== monthKey) {
      curMonthBlock = { key: monthKey, name: cursor.toLocaleDateString('en-US', { month: 'short' }), weeks: [] };
      months.push(curMonthBlock);
    }
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    curMonthBlock.weeks.push(week);
  }

  months.forEach(mb => {
    const monthDiv = document.createElement('div');
    monthDiv.className = 'yg2-month';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'yg2-name';
    nameDiv.textContent = mb.name;
    monthDiv.appendChild(nameDiv);
    const grid = document.createElement('div');
    grid.className = 'yg2-grid';
    mb.weeks.forEach(week => {
      week.forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'yg2-cell';
        if (d > today) { cell.style.background = 'transparent'; }
        else {
          const key = dateKey(d);
          const e = entries[key];
          const mi = e ? moodInfo(e.mood) : null;
          cell.style.background = mi ? mi.color : (e ? 'var(--accent)' : 'var(--surface-2)');
          cell.title = fmt.short(key);
        }
        grid.appendChild(cell);
      });
    });
    monthDiv.appendChild(grid);
    outer.appendChild(monthDiv);
  });

  container.appendChild(outer);
}

// ─── SETTINGS VIEW ──────────────────────────────────────────────

function renderSettings() {
  const u = _fbAuth.currentUser;
  const photoHTML = u && u.photoURL
    ? `<img class="account-avatar" src="${u.photoURL}" referrerpolicy="no-referrer">`
    : `<div class="account-avatar-fallback">${((u && u.email) || 'U')[0].toUpperCase()}</div>`;

  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Settings</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Account</span></div>
      <div class="account-card">
        ${photoHTML}
        <div style="min-width:0">
          <div class="account-name">${escHtml((u && u.displayName) || 'You')}</div>
          <div class="account-email">${escHtml((u && u.email) || '')}</div>
        </div>
      </div>
      <div class="settings-row">
        <div><div class="label">Sync status</div><p><span class="sync-dot" id="sync-dot"></span><span id="sync-label">Synced across your devices</span></p></div>
        <button class="btn-secondary" id="signout-btn">Sign out</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Data</span></div>
      <div class="settings-row">
        <div><div class="label">Export journal</div><p>Download all entries as a JSON backup</p></div>
        <button class="btn-secondary" id="export-btn">Export</button>
      </div>
      <div class="settings-row">
        <div><div class="label">Import journal</div><p>Restore entries from a JSON backup</p></div>
        <label class="btn-secondary" style="cursor:pointer">Import<input type="file" id="import-file" accept="application/json" style="display:none"></label>
      </div>
      <div class="settings-row">
        <div><div class="label">Clear all data</div><p>Permanently delete every entry, on this device and in the cloud</p></div>
        <button class="btn-danger-outline" id="clear-btn">Clear</button>
      </div>
    </div>
  `;

  updateSyncDot();

  document.getElementById('signout-btn').onclick = () => { _fbAuth.signOut().then(() => window.location.reload()); };

  document.getElementById('export-btn').onclick = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'journal-export-' + todayKey() + '.json'; a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        entries = Object.assign({}, entries, imported);
        saveLocal();
        for (const k of Object.keys(imported)) await fsSaveEntry(k, entries[k]);
        render();
      } catch (err) { alert('Import failed: invalid file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('clear-btn').onclick = async () => {
    if (confirm('Delete all journal entries? This cannot be undone.')) {
      const keys = Object.keys(entries);
      entries = {};
      saveLocal();
      for (const k of keys) await fsDeleteEntry(k);
      render();
    }
  };
}

// ─── MODAL ────────────────────────────────────────────────────────

function openModal() { document.getElementById('modal-backdrop').classList.add('open'); }
function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); }

// ─── THEME ────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  document.body.classList.toggle('dark', saved === 'dark');
  document.getElementById('theme-toggle').textContent = saved === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  document.getElementById('theme-toggle').textContent = isDark ? '☀️' : '🌙';
}

// ─── NAV WIRING ───────────────────────────────────────────────────

function wireNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      state.view = btn.dataset.view;
      if (state.view === 'today') state.composerDate = todayKey();
      render();
    };
  });
  document.getElementById('theme-toggle').onclick = toggleTheme;
  document.getElementById('account-btn').onclick = () => {
    state.view = 'settings';
    render();
  };
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

// ─── INIT / AUTH ────────────────────────────────────────────────

let _appInitDone = false;

function _appInit() {
  initTheme();
  wireNav();
  render();
}

function init() {
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  loadLocal();

  const signinBtn = document.getElementById('google-signin-btn');
  const signinErr = document.createElement('div');
  signinErr.style.cssText = 'color:#ef4444;font-size:.8rem;margin-top:8px;text-align:center;max-width:280px;display:none';
  signinBtn.parentNode.insertBefore(signinErr, signinBtn.nextSibling);

  function showSigninError(msg) {
    signinErr.textContent = msg;
    signinErr.style.display = 'block';
    signinBtn.disabled = false;
    signinBtn.style.opacity = '';
  }

  signinBtn.onclick = () => {
    signinBtn.disabled = true;
    signinBtn.style.opacity = '0.6';
    signinErr.style.display = 'none';
    const provider = new firebase.auth.GoogleAuthProvider();
    _fbAuth.signInWithPopup(provider).catch(e => {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        _fbAuth.signInWithRedirect(provider);
      } else {
        showSigninError('Sign-in failed: ' + (e.message || e.code));
      }
    });
  };

  _fbAuth.getRedirectResult().catch(e => {
    if (e && e.code !== 'auth/no-auth-event') showSigninError('Sign-in failed: ' + (e.message || e.code));
  });

  _fbAuth.onAuthStateChanged(async user => {
    _fbUser = user;
    if (!user) {
      document.getElementById('auth-gate').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      return;
    }
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('app').style.display = '';

    await fsPullAll();

    if (!_appInitDone) { _appInitDone = true; _appInit(); }
    else render();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _fbUser) fsPullAll().then(() => render());
  });
}

document.addEventListener('DOMContentLoaded', init);
