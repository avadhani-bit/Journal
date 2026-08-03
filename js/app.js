/* ================================================================
   Journal — app.js
   Local-first with Firebase Auth (Google) + Firestore sync.
   Entries are ID-keyed, so a day can hold many entries.
================================================================ */

'use strict';

/* ─── Firebase ────────────────────────────────────────────────── */

const FB_CONFIG = {
  apiKey:            'AIzaSyBpUUVpBIsuKAx1Tw-cnN4ItXho7IqbMMQ',
  authDomain:        'checkcheck-3d35f.firebaseapp.com',
  projectId:         'checkcheck-3d35f',
  storageBucket:     'checkcheck-3d35f.firebasestorage.app',
  messagingSenderId: '744363444071',
  appId:             '1:744363444071:web:5e72bf03a2771ae83c91c2',
};
firebase.initializeApp(FB_CONFIG);
const fbAuth  = firebase.auth();
const fbStore = firebase.firestore();
let   fbUser  = null;
let   syncState = 'offline';

const col = () => fbStore.collection('users').doc(fbUser.uid).collection('journalEntries');
const metaDoc = () => fbStore.collection('users').doc(fbUser.uid).collection('journalMeta').doc('config');

function setSync(s) {
  syncState = s;
  const dot = document.getElementById('sync-dot');
  if (dot) dot.className = 'dot-live' + (s === 'syncing' ? ' sync' : s === 'offline' ? ' off' : '');
  const lbl = document.getElementById('sync-label');
  if (lbl) lbl.textContent = s === 'syncing' ? 'Syncing…' : s === 'offline' ? 'Offline — saved on this device' : 'Synced across your devices';
}

async function pushEntry(e) {
  if (!fbUser) return;
  setSync('syncing');
  try { await col().doc(e.id).set(e); setSync('synced'); }
  catch (err) { console.warn('push failed', err); setSync('offline'); }
}
async function removeEntry(id) {
  if (!fbUser) return;
  try { await col().doc(id).delete(); } catch (err) { console.warn('delete failed', err); }
}
async function pushMeta() {
  if (!fbUser) return;
  try { await metaDoc().set({ journals: DB.journals, updatedAt: Date.now() }); }
  catch (err) { console.warn('meta push failed', err); }
}

async function pullAll() {
  if (!fbUser) return;
  setSync('syncing');
  try {
    const [snap, meta] = await Promise.all([col().get(), metaDoc().get()]);
    if (meta.exists && Array.isArray(meta.data().journals) && meta.data().journals.length) {
      DB.journals = meta.data().journals;
    }
    if (!snap.empty) {
      const remote = {};
      snap.forEach(d => { remote[d.id] = d.data(); });
      // Merge: newest updatedAt wins
      Object.keys(remote).forEach(id => {
        const local = DB.entries[id];
        if (!local || (remote[id].updatedAt || 0) >= (local.updatedAt || 0)) DB.entries[id] = remote[id];
      });
      saveLocal();
    } else {
      for (const id of Object.keys(DB.entries)) await pushEntry(DB.entries[id]);
      await pushMeta();
    }
    setSync('synced');
  } catch (err) { console.warn('pull failed', err); setSync('offline'); }
}

/* ─── Utils ───────────────────────────────────────────────────── */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $  = id => document.getElementById(id);

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dkey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const todayKey = () => dkey(new Date());
const parseKey = k => new Date(k + 'T00:00:00');

const fmt = {
  full:  k => parseKey(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  med:   k => parseKey(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  short: k => parseKey(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  time:  ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  rel: k => {
    const diff = Math.round((parseKey(todayKey()) - parseKey(k)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7 && diff > 0) return diff + ' days ago';
    if (diff < 0) return 'Upcoming';
    const w = Math.floor(diff / 7);
    if (w < 5) return w + (w === 1 ? ' week ago' : ' weeks ago');
    const m = Math.floor(diff / 30);
    if (m < 12) return m + (m === 1 ? ' month ago' : ' months ago');
    const y = Math.floor(diff / 365);
    return y + (y === 1 ? ' year ago' : ' years ago');
  },
};

function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
function countWords(t) {
  const s = (t || '').trim();
  return s ? s.split(/\s+/).length : 0;
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ─── Moods ───────────────────────────────────────────────────── */

const MOODS = [
  { v: 1, l: 'Rough', c: '#EF4444' },
  { v: 2, l: 'Low',   c: '#F59E0B' },
  { v: 3, l: 'Okay',  c: '#9B9CA8' },
  { v: 4, l: 'Good',  c: '#22B07D' },
  { v: 5, l: 'Great', c: '#10B981' },
];
const mood = v => MOODS.find(m => m.v === v);

const FACE = {
  1: '<path d="M7 8.7L10 10"/><path d="M17 8.7L14 10"/><circle cx="8.7" cy="11.3" r="1" fill="currentColor" stroke="none"/><circle cx="15.3" cy="11.3" r="1" fill="currentColor" stroke="none"/><path d="M8 17.5Q12 13.3 16 17.5"/>',
  2: '<circle cx="8.7" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="15.3" cy="10.8" r="1" fill="currentColor" stroke="none"/><path d="M8 16.2Q12 14.3 16 16.2"/>',
  3: '<circle cx="8.7" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="15.3" cy="10.8" r="1" fill="currentColor" stroke="none"/><path d="M8 15L16 15"/>',
  4: '<circle cx="8.7" cy="10.6" r="1" fill="currentColor" stroke="none"/><circle cx="15.3" cy="10.6" r="1" fill="currentColor" stroke="none"/><path d="M8 14Q12 16.6 16 14"/>',
  5: '<path d="M7.4 10.6Q8.7 9.2 10 10.6"/><path d="M14 10.6Q15.3 9.2 16.6 10.6"/><path d="M7.5 13.6Q12 18.6 16.5 13.6"/>',
};

function moodSvg(v, size, color) {
  const m = mood(v);
  const c = color || (m ? m.c : 'currentColor');
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;color:' + c + '">'
    + '<circle cx="12" cy="12" r="9"/>' + (FACE[v] || '') + '</svg>';
}

/* ─── Prompts ─────────────────────────────────────────────────── */

const PROMPTS = [
  "What's one thing that made you smile today?",
  "What's weighing on your mind right now?",
  "Describe a small win from today.",
  "What are you grateful for in this moment?",
  "What would make tomorrow feel like a good day?",
  "Write about a conversation that stuck with you.",
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
  "What's a boundary you held, or wish you'd held?",
  "What's one thing your body is telling you right now?",
  "What surprised you today?",
  "What's something you're proud of, even if small?",
  "Write a note to yourself one year from now.",
  "What pattern have you noticed in yourself lately?",
  "What does rest look like for you right now?",
  "What's a question you don't have the answer to yet?",
  "Who do you want to reach out to, and why haven't you?",
  "What's one thing you could simplify?",
  "Describe today using the weather as a metaphor.",
  "What did you do for someone else today?",
];
function promptFor(k) {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h % PROMPTS.length;
}

/* ─── Storage ─────────────────────────────────────────────────── */

const LS = { entries: 'jr2_entries', journals: 'jr2_journals', theme: 'jr2_theme', prefs: 'jr2_prefs' };

const JOURNAL_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#0EA5E9', '#84CC16'];

const DB = {
  entries: {},
  journals: [{ id: 'default', name: 'Personal', color: '#6366F1' }],
  prefs: { hidePrompt: false },
};

function loadLocal() {
  try { DB.entries = JSON.parse(localStorage.getItem(LS.entries) || '{}'); } catch { DB.entries = {}; }
  try {
    const j = JSON.parse(localStorage.getItem(LS.journals) || 'null');
    if (Array.isArray(j) && j.length) DB.journals = j;
  } catch {}
  try {
    const p = JSON.parse(localStorage.getItem(LS.prefs) || 'null');
    if (p) DB.prefs = Object.assign(DB.prefs, p);
  } catch {}
  migrateV1();
}
function saveLocal() { localStorage.setItem(LS.entries, JSON.stringify(DB.entries)); }
function saveJournals() { localStorage.setItem(LS.journals, JSON.stringify(DB.journals)); pushMeta(); }
function savePrefs() { localStorage.setItem(LS.prefs, JSON.stringify(DB.prefs)); }

// Bring forward entries from the first version (date-keyed, single entry per day)
function migrateV1() {
  let old = null;
  try { old = JSON.parse(localStorage.getItem('jr_entries') || 'null'); } catch {}
  if (!old || !Object.keys(old).length) return;
  if (localStorage.getItem('jr2_migrated')) return;
  Object.keys(old).forEach(k => {
    const o = old[k];
    const id = uid();
    const text = o.text || '';
    DB.entries[id] = {
      id, journalId: 'default', date: k,
      title: '', html: text ? '<p>' + esc(text).replace(/\n+/g, '</p><p>') + '</p>' : '',
      plain: text, mood: o.mood || null, tags: o.tags || [],
      photos: o.photo ? [o.photo] : [], favorite: false,
      words: countWords(text),
      createdAt: o.updatedAt || Date.now(), updatedAt: o.updatedAt || Date.now(),
    };
  });
  localStorage.setItem('jr2_migrated', '1');
  saveLocal();
}

/* ─── Derived data ────────────────────────────────────────────── */

const allEntries = () => Object.values(DB.entries);

function sortedEntries(list) {
  return list.slice().sort((a, b) =>
    a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : (a.date < b.date ? 1 : -1));
}

function journalById(id) { return DB.journals.find(j => j.id === id) || DB.journals[0]; }

function allTags() {
  const counts = {};
  allEntries().forEach(e => (e.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map(t => ({ tag: t, n: counts[t] }));
}

function streaks() {
  const days = new Set(allEntries().map(e => e.date));
  if (!days.size) return { current: 0, longest: 0 };
  const sorted = Array.from(days).sort();
  let longest = 0, run = 0, prev = null;
  sorted.forEach(k => {
    const d = parseKey(k);
    run = prev && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  });
  let current = 0, cur = new Date();
  if (!days.has(dkey(cur))) cur.setDate(cur.getDate() - 1);
  while (days.has(dkey(cur))) { current++; cur.setDate(cur.getDate() - 1); }
  return { current, longest };
}

/* ─── App state ───────────────────────────────────────────────── */

const state = {
  view: 'timeline',
  search: '',
  journalFilter: null,
  tagFilter: null,
  moodFilter: null,
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  editing: null,   // working copy of the entry being edited
  isNew: false,
  viewingId: null,
};

/* ─── Render dispatch ─────────────────────────────────────────── */

const content = () => $('content');

function render() {
  syncNav();
  renderSidebarLists();
  updateStreakChip();
  if (state.view === 'timeline')  renderTimeline();
  if (state.view === 'favorites') renderTimeline(true);
  if (state.view === 'calendar')  renderCalendar();
  if (state.view === 'insights')  renderInsights();
  if (state.view === 'settings')  renderSettings();
}

function go(view) {
  state.view = view;
  closeSidebar();
  content().scrollTop = 0;
  window.scrollTo(0, 0);
  render();
}

function syncNav() {
  document.querySelectorAll('.side-link[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === state.view));
  document.querySelectorAll('.bn-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === state.view));
  $('settings-link').classList.toggle('active', state.view === 'settings');
}

function updateStreakChip() {
  $('streak-count').textContent = streaks().current;
}

function renderSidebarLists() {
  const counts = {};
  allEntries().forEach(e => { counts[e.journalId] = (counts[e.journalId] || 0) + 1; });

  $('journal-list').innerHTML = DB.journals.map(j => `
    <button class="journal-item${state.journalFilter === j.id ? ' active' : ''}" data-journal="${j.id}">
      <span class="jdot" style="background:${j.color}"></span>
      <span>${esc(j.name)}</span>
      <span class="jcount">${counts[j.id] || 0}</span>
    </button>`).join('');

  document.querySelectorAll('[data-journal]').forEach(b => {
    b.onclick = () => {
      state.journalFilter = state.journalFilter === b.dataset.journal ? null : b.dataset.journal;
      if (state.view !== 'timeline' && state.view !== 'favorites') state.view = 'timeline';
      closeSidebar();
      render();
    };
    b.oncontextmenu = ev => { ev.preventDefault(); openJournalModal(journalById(b.dataset.journal)); };
  });

  const tags = allTags().slice(0, 14);
  $('tag-cloud-section').style.display = tags.length ? '' : 'none';
  $('tag-cloud').innerHTML = tags.map(t =>
    `<button data-tag="${esc(t.tag)}" class="${state.tagFilter === t.tag ? 'active' : ''}">#${esc(t.tag)}</button>`).join('');
  document.querySelectorAll('[data-tag]').forEach(b => {
    b.onclick = () => {
      state.tagFilter = state.tagFilter === b.dataset.tag ? null : b.dataset.tag;
      if (state.view !== 'timeline' && state.view !== 'favorites') state.view = 'timeline';
      closeSidebar();
      render();
    };
  });
}

/* ─── Filtering ───────────────────────────────────────────────── */

function filtered(favOnly) {
  const q = state.search.trim().toLowerCase();
  return sortedEntries(allEntries().filter(e => {
    if (favOnly && !e.favorite) return false;
    if (state.journalFilter && e.journalId !== state.journalFilter) return false;
    if (state.tagFilter && !(e.tags || []).includes(state.tagFilter)) return false;
    if (state.moodFilter && e.mood !== state.moodFilter) return false;
    if (q) {
      const hay = ((e.title || '') + ' ' + (e.plain || '') + ' ' + (e.tags || []).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }));
}

function activeFilterChips() {
  const chips = [];
  if (state.journalFilter) {
    const j = journalById(state.journalFilter);
    chips.push({ key: 'journalFilter', label: j.name, color: j.color });
  }
  if (state.tagFilter) chips.push({ key: 'tagFilter', label: '#' + state.tagFilter });
  if (state.moodFilter) {
    const m = mood(state.moodFilter);
    chips.push({ key: 'moodFilter', label: m ? m.l : '' });
  }
  return chips;
}

/* ─── Timeline ────────────────────────────────────────────────── */

function renderTimeline(favOnly) {
  const list = filtered(favOnly);
  const chips = activeFilterChips();

  const groups = [];
  let cur = null;
  list.forEach(e => {
    if (!cur || cur.date !== e.date) { cur = { date: e.date, items: [] }; groups.push(cur); }
    cur.items.push(e);
  });

  const total = allEntries().length;
  const heading = favOnly ? 'Favorites' : (state.search ? 'Search' : 'Timeline');
  const sub = favOnly
    ? list.length + (list.length === 1 ? ' starred entry' : ' starred entries')
    : (state.search
        ? list.length + (list.length === 1 ? ' match' : ' matches') + ' for “' + esc(state.search) + '”'
        : total + (total === 1 ? ' entry' : ' entries') + ' · ' + streaks().current + ' day streak');

  content().innerHTML = `
    <div class="page-head">
      <div class="page-title">${heading}</div>
      <div class="page-sub">${sub}</div>
    </div>
    ${chips.length ? `<div class="filter-bar">
      ${chips.map(c => `<button class="chip active" data-clear="${c.key}">
        ${c.color ? `<span class="jdot" style="background:${c.color}"></span>` : ''}${esc(c.label)}
        <svg viewBox="0 0 24 24" class="ic"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>`).join('')}
      <button class="chip" data-clear="all">Clear all</button>
    </div>` : ''}
    <div id="timeline-list">
      ${groups.length ? groups.map(g => `
        <div class="day-group">
          <div class="day-head">
            <span class="day-date">${fmt.med(g.date)}</span>
            <span class="day-rel">${fmt.rel(g.date)}</span>
          </div>
          ${g.items.map(entryCard).join('')}
        </div>`).join('') : emptyState(favOnly)}
    </div>`;

  document.querySelectorAll('[data-clear]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.clear === 'all') { state.journalFilter = state.tagFilter = state.moodFilter = null; }
      else state[b.dataset.clear] = null;
      render();
    };
  });
  document.querySelectorAll('[data-open]').forEach(c => {
    c.onclick = () => openViewer(c.dataset.open);
  });
}

function emptyState(favOnly) {
  if (favOnly) return `<div class="empty">
    <div class="empty-ic"><svg viewBox="0 0 24 24" class="ic" style="width:30px;height:30px"><path d="M12 17.75l-6.17 3.24 1.18-6.87-5-4.86 6.9-1L12 2l3.09 6.26 6.9 1-5 4.86 1.18 6.87z"/></svg></div>
    <h3>No favorites yet</h3><p>Star an entry to keep it close. It'll show up here.</p></div>`;
  if (state.search || state.tagFilter || state.journalFilter || state.moodFilter) return `<div class="empty">
    <div class="empty-ic"><svg viewBox="0 0 24 24" class="ic" style="width:30px;height:30px"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.1-4.1"/></svg></div>
    <h3>Nothing matches</h3><p>Try a different search, or clear your filters.</p></div>`;
  return `<div class="empty">
    <div class="empty-ic"><svg viewBox="0 0 24 24" class="ic" style="width:30px;height:30px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
    <h3>Your journal starts here</h3><p>Write about today — a line is plenty. Prompts are there if you want a nudge.</p>
    <button class="btn-primary" onclick="openEditor()">Write your first entry</button></div>`;
}

function entryCard(e) {
  const j = journalById(e.journalId);
  const m = mood(e.mood);
  const preview = (e.plain || '').slice(0, 240);
  const photos = e.photos || [];
  return `
    <button class="entry-card" data-open="${e.id}">
      <span class="accent-edge" style="background:${j.color}"></span>
      <div class="ec-top">
        ${m ? moodSvg(m.v, 17) : ''}
        <span class="ec-time">${fmt.time(e.createdAt)}</span>
        <span class="ec-journal" style="background:${j.color}1a;color:${j.color}">${esc(j.name)}</span>
        ${e.favorite ? '<span class="ec-star"><svg viewBox="0 0 24 24" class="ic"><path d="M12 17.75l-6.17 3.24 1.18-6.87-5-4.86 6.9-1L12 2l3.09 6.26 6.9 1-5 4.86 1.18 6.87z"/></svg></span>' : ''}
      </div>
      ${e.title ? `<div class="ec-title">${esc(e.title)}</div>` : ''}
      ${preview ? `<div class="ec-preview">${esc(preview)}</div>` : '<div class="ec-preview" style="color:var(--text-3)">No text</div>'}
      ${photos.length ? `<div class="ec-thumbs">
        ${photos.slice(0, 3).map(p => `<img src="${p}" alt="">`).join('')}
        ${photos.length > 3 ? `<div class="ec-thumb-more">+${photos.length - 3}</div>` : ''}
      </div>` : ''}
      <div class="ec-foot">
        ${(e.tags || []).slice(0, 4).map(t => `<span class="ec-tag">#${esc(t)}</span>`).join('')}
        <span class="ec-meta">${e.words || 0} words</span>
      </div>
    </button>`;
}

/* ─── Calendar ────────────────────────────────────────────────── */

function renderCalendar() {
  const y = state.calYear, m = state.calMonth;
  const label = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const now = new Date();
  const isCur = m === now.getMonth() && y === now.getFullYear();
  const offset = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  const byDate = {};
  allEntries().forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });

  const monthKeys = [];
  for (let d = 1; d <= days; d++) monthKeys.push(dkey(new Date(y, m, d)));
  const monthEntries = monthKeys.reduce((n, k) => n + (byDate[k] ? byDate[k].length : 0), 0);
  const daysWritten = monthKeys.filter(k => byDate[k]).length;

  content().innerHTML = `
    <div class="page-head">
      <div class="page-title">Calendar</div>
      <div class="page-sub">${monthEntries} ${monthEntries === 1 ? 'entry' : 'entries'} · ${daysWritten} of ${days} days written</div>
    </div>
    <div class="card">
      <div class="month-nav">
        <button class="icon-btn" id="cal-prev" aria-label="Previous month"><svg viewBox="0 0 24 24" class="ic"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span class="month-label">${label}</span>
        <button class="icon-btn" id="cal-next" aria-label="Next month" ${isCur ? 'disabled style="opacity:.3"' : ''}><svg viewBox="0 0 24 24" class="ic"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div class="cal-grid">
        ${['S','M','T','W','T','F','S'].map(d => `<div class="cal-hdr">${d}</div>`).join('')}
        ${Array.from({ length: offset }).map(() => '<div class="cal-cell blank"></div>').join('')}
        ${Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const k = dkey(new Date(y, m, day));
          const list = byDate[k] || [];
          const isToday = k === todayKey();
          const avg = list.filter(e => e.mood).length
            ? Math.round(list.filter(e => e.mood).reduce((s, e) => s + e.mood, 0) / list.filter(e => e.mood).length)
            : null;
          const mc = avg ? mood(avg).c : null;
          return `<div class="cal-cell${list.length ? ' has' : ''}${isToday ? ' today' : ''}"
            ${list.length ? `data-day="${k}"` : ''}
            ${mc ? `style="background:${mc}1f;border-color:${mc}59;color:var(--text-1)"` : ''}>
            <span>${day}</span>
            ${list.length ? `<span class="cal-dots">${list.slice(0, 3).map(e => {
              const j = journalById(e.journalId);
              return `<span class="cal-dot" style="background:${j.color}"></span>`;
            }).join('')}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
    <div id="cal-day-list"></div>`;

  $('cal-prev').onclick = () => {
    if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; } else state.calMonth--;
    renderCalendar();
  };
  $('cal-next').onclick = () => {
    if (isCur) return;
    if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; } else state.calMonth++;
    renderCalendar();
  };
  document.querySelectorAll('[data-day]').forEach(c => {
    c.onclick = () => showDay(c.dataset.day, byDate[c.dataset.day] || []);
  });
}

function showDay(key, list) {
  $('cal-day-list').innerHTML = `
    <div class="page-head" style="margin-top:22px">
      <div class="page-title" style="font-size:1.1rem">${fmt.full(key)}</div>
      <div class="page-sub">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</div>
    </div>
    ${sortedEntries(list).map(entryCard).join('')}`;
  document.querySelectorAll('#cal-day-list [data-open]').forEach(c => {
    c.onclick = () => openViewer(c.dataset.open);
  });
  $('cal-day-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─── Insights ────────────────────────────────────────────────── */

function renderInsights() {
  const list = allEntries();
  const { current, longest } = streaks();
  const words = list.reduce((s, e) => s + (e.words || 0), 0);
  const days = new Set(list.map(e => e.date)).size;

  const today = new Date();
  const last30 = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); last30.push(dkey(d)); }
  const moodByDay = last30.map(k => {
    const es = list.filter(e => e.date === k && e.mood);
    return es.length ? es.reduce((s, e) => s + e.mood, 0) / es.length : null;
  });
  const valid = moodByDay.filter(v => v != null);
  const avg = valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '—';

  // Mood distribution
  const dist = MOODS.map(m => ({ ...m, n: list.filter(e => e.mood === m.v).length }));
  const distMax = Math.max(1, ...dist.map(d => d.n));

  // Day of week
  const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name, i) => {
    const es = list.filter(e => parseKey(e.date).getDay() === i);
    return { name, n: es.length };
  });
  const dowMax = Math.max(1, ...dow.map(d => d.n));

  const tags = allTags().slice(0, 8);
  const tagMax = Math.max(1, ...tags.map(t => t.n));

  content().innerHTML = `
    <div class="page-head">
      <div class="page-title">Insights</div>
      <div class="page-sub">Patterns across ${list.length} ${list.length === 1 ? 'entry' : 'entries'}</div>
    </div>

    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat"><div class="stat-val" style="color:var(--accent)">${current}</div><div class="stat-lbl">Current streak</div></div>
      <div class="stat"><div class="stat-val">${longest}</div><div class="stat-lbl">Longest streak</div></div>
      <div class="stat"><div class="stat-val">${avg}</div><div class="stat-lbl">Avg mood (30d)</div></div>
      <div class="stat"><div class="stat-val">${days}</div><div class="stat-lbl">Days written</div></div>
      <div class="stat"><div class="stat-val">${words.toLocaleString()}</div><div class="stat-lbl">Total words</div></div>
      <div class="stat"><div class="stat-val">${days ? Math.round(words / days) : 0}</div><div class="stat-lbl">Words per day</div></div>
    </div>

    <div class="card">
      <div class="card-title">Mood · last 30 days</div>
      ${valid.length ? '<canvas id="mood-chart" height="150"></canvas>'
        : '<p style="font-size:.85rem;color:var(--text-3)">Log a few moods and a trend line will show up here.</p>'}
    </div>

    <div class="card">
      <div class="card-title">How often each mood</div>
      ${dist.map(d => `
        <div class="bar-row">
          <span class="bar-lbl" style="display:flex;align-items:center;gap:7px">${moodSvg(d.v, 15)}${d.l}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(d.n / distMax) * 100}%;background:${d.c}"></div></div>
          <span class="bar-num">${d.n}</span>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="card-title">When you write</div>
      ${dow.map(d => `
        <div class="bar-row">
          <span class="bar-lbl">${d.name}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(d.n / dowMax) * 100}%"></div></div>
          <span class="bar-num">${d.n}</span>
        </div>`).join('')}
    </div>

    ${tags.length ? `<div class="card">
      <div class="card-title">Most used tags</div>
      ${tags.map(t => `
        <div class="bar-row">
          <span class="bar-lbl">#${esc(t.tag)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(t.n / tagMax) * 100}%"></div></div>
          <span class="bar-num">${t.n}</span>
        </div>`).join('')}
    </div>` : ''}

    <div class="card">
      <div class="card-title">Writing history</div>
      <div class="heat-wrap"><div class="heat-months" id="heatmap"></div></div>
      <div class="heat-legend">
        <span>Less</span>
        ${['var(--surface-3)','#C7D2FE','#A5B4FC','#818CF8','#6366F1'].map(c => `<span class="heat-cell" style="background:${c}"></span>`).join('')}
        <span>More</span>
      </div>
    </div>`;

  if (valid.length) drawMoodChart(moodByDay);
  buildHeatmap();
}

function drawMoodChart(vals) {
  const canvas = $('mood-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600, h = 150;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = 14, gw = w - pad * 2, gh = h - pad * 2, n = vals.length;
  const cs = getComputedStyle(document.body);
  const accent = cs.getPropertyValue('--accent').trim() || '#6366F1';
  const grid = cs.getPropertyValue('--border-soft').trim() || '#eee';

  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    const y = pad + gh - ((i - 1) / 4) * gh;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + gw, y); ctx.stroke();
  }

  const pt = (v, i) => [pad + (i / (n - 1)) * gw, pad + gh - ((v - 1) / 4) * gh];

  // Area fill under the line
  ctx.beginPath();
  let open = false;
  vals.forEach((v, i) => {
    if (v == null) return;
    const [x, y] = pt(v, i);
    if (!open) { ctx.moveTo(x, pad + gh); ctx.lineTo(x, y); open = true; }
    else ctx.lineTo(x, y);
  });
  if (open) {
    const lastIdx = vals.reduce((acc, v, i) => v != null ? i : acc, 0);
    ctx.lineTo(pt(vals[lastIdx], lastIdx)[0], pad + gh);
    ctx.closePath();
    ctx.fillStyle = accent + '1f';
    ctx.fill();
  }

  ctx.beginPath();
  let started = false;
  vals.forEach((v, i) => {
    if (v == null) { started = false; return; }
    const [x, y] = pt(v, i);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke();

  vals.forEach((v, i) => {
    if (v == null) return;
    const [x, y] = pt(v, i);
    ctx.beginPath(); ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
  });
}

function buildHeatmap() {
  const wrap = $('heatmap');
  if (!wrap) return;
  const counts = {};
  allEntries().forEach(e => { counts[e.date] = (counts[e.date] || 0) + 1; });

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 300);
  start.setDate(start.getDate() - start.getDay());

  const months = [];
  let cursor = new Date(start), block = null;
  while (cursor <= today) {
    const mk = cursor.getFullYear() + '-' + cursor.getMonth();
    if (!block || block.k !== mk) {
      block = { k: mk, name: cursor.toLocaleDateString('en-US', { month: 'short' }), cells: [] };
      months.push(block);
    }
    for (let i = 0; i < 7; i++) { block.cells.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
  }

  const shade = n => !n ? 'var(--surface-3)' : n === 1 ? '#C7D2FE' : n === 2 ? '#A5B4FC' : n === 3 ? '#818CF8' : '#6366F1';

  wrap.innerHTML = months.map(mo => `
    <div class="heat-month">
      <div class="heat-name">${mo.name}</div>
      <div class="heat-grid">
        ${mo.cells.map(d => {
          if (d > today) return '<div class="heat-cell" style="background:transparent"></div>';
          const k = dkey(d), n = counts[k] || 0;
          return `<div class="heat-cell" style="background:${shade(n)}" title="${fmt.short(k)} · ${n} ${n === 1 ? 'entry' : 'entries'}"></div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

/* ─── Settings ────────────────────────────────────────────────── */

function renderSettings() {
  const u = fbAuth.currentUser;
  const av = u && u.photoURL
    ? `<img src="${u.photoURL}" referrerpolicy="no-referrer" alt="">`
    : ((u && u.email || 'U')[0].toUpperCase());

  content().innerHTML = `
    <div class="page-head"><div class="page-title">Settings</div></div>

    <div class="card">
      <div class="card-title">Account</div>
      <div class="acct">
        <div class="acct-av">${av}</div>
        <div style="min-width:0">
          <div class="acct-name">${esc((u && u.displayName) || 'You')}</div>
          <div class="acct-mail">${esc((u && u.email) || '')}</div>
        </div>
      </div>
      <div class="set-row">
        <div><div class="lbl">Sync</div><p><span class="dot-live" id="sync-dot"></span><span id="sync-label">Synced across your devices</span></p></div>
        <button class="btn-secondary" id="signout">Sign out</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Journals</div>
      <div id="settings-journals"></div>
      <button class="btn-secondary" id="new-journal" style="margin-top:12px">New journal</button>
    </div>

    <div class="card">
      <div class="card-title">Writing</div>
      <div class="set-row">
        <div><div class="lbl">Daily prompts</div><p>Show a suggested prompt at the top of new entries</p></div>
        <button class="btn-secondary" id="toggle-prompt">${DB.prefs.hidePrompt ? 'Off' : 'On'}</button>
      </div>
      <div class="set-row">
        <div><div class="lbl">Appearance</div><p>Switch between light and dark</p></div>
        <button class="btn-secondary" id="toggle-theme-2">${document.body.classList.contains('dark') ? 'Dark' : 'Light'}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Data</div>
      <div class="set-row">
        <div><div class="lbl">Export</div><p>Download every entry as a JSON backup</p></div>
        <button class="btn-secondary" id="export">Export</button>
      </div>
      <div class="set-row">
        <div><div class="lbl">Import</div><p>Restore entries from a backup file</p></div>
        <label class="btn-secondary" style="cursor:pointer">Import<input type="file" id="import" accept="application/json" hidden></label>
      </div>
      <div class="set-row">
        <div><div class="lbl">Delete everything</div><p>Removes all entries here and in the cloud. Can't be undone.</p></div>
        <button class="btn-ghost-danger" id="wipe">Delete</button>
      </div>
    </div>

    <p style="text-align:center;font-size:.72rem;color:var(--text-3);margin-top:20px">
      Journal · your entries are private to your account
    </p>`;

  setSync(syncState);
  renderSettingsJournals();

  $('signout').onclick = () => fbAuth.signOut().then(() => location.reload());
  $('new-journal').onclick = () => openJournalModal();
  $('toggle-prompt').onclick = () => { DB.prefs.hidePrompt = !DB.prefs.hidePrompt; savePrefs(); renderSettings(); };
  $('toggle-theme-2').onclick = () => { toggleTheme(); renderSettings(); };

  $('export').onclick = () => {
    const payload = { version: 2, exportedAt: new Date().toISOString(), journals: DB.journals, entries: DB.entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'journal-backup-' + todayKey() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded');
  };

  $('import').onchange = ev => {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        const incoming = data.entries || data;
        let n = 0;
        for (const id of Object.keys(incoming)) {
          const it = incoming[id];
          if (!it || !it.date) continue;
          DB.entries[it.id || id] = it;
          await pushEntry(it);
          n++;
        }
        if (Array.isArray(data.journals) && data.journals.length) { DB.journals = data.journals; saveJournals(); }
        saveLocal();
        toast('Imported ' + n + ' entries');
        render();
      } catch { toast('That file could not be read'); }
    };
    r.readAsText(f);
    ev.target.value = '';
  };

  $('wipe').onclick = async () => {
    if (!confirm('Delete every entry, everywhere? This cannot be undone.')) return;
    const ids = Object.keys(DB.entries);
    DB.entries = {};
    saveLocal();
    for (const id of ids) await removeEntry(id);
    toast('All entries deleted');
    render();
  };
}

function renderSettingsJournals() {
  const counts = {};
  allEntries().forEach(e => { counts[e.journalId] = (counts[e.journalId] || 0) + 1; });
  $('settings-journals').innerHTML = DB.journals.map(j => `
    <div class="set-row">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="jdot" style="background:${j.color};width:11px;height:11px"></span>
        <div><div class="lbl">${esc(j.name)}</div><p>${counts[j.id] || 0} entries</p></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-secondary" data-edit-j="${j.id}">Edit</button>
        ${DB.journals.length > 1 ? `<button class="icon-btn danger" data-del-j="${j.id}" aria-label="Delete journal"><svg viewBox="0 0 24 24" class="ic"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}
      </div>
    </div>`).join('');

  document.querySelectorAll('[data-edit-j]').forEach(b => {
    b.onclick = () => openJournalModal(journalById(b.dataset.editJ));
  });
  document.querySelectorAll('[data-del-j]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.delJ;
      const n = allEntries().filter(e => e.journalId === id).length;
      if (!confirm(n ? `Delete this journal? Its ${n} entries move to "${DB.journals.find(j => j.id !== id).name}".` : 'Delete this journal?')) return;
      const fallback = DB.journals.find(j => j.id !== id).id;
      allEntries().forEach(e => {
        if (e.journalId === id) { e.journalId = fallback; e.updatedAt = Date.now(); pushEntry(e); }
      });
      DB.journals = DB.journals.filter(j => j.id !== id);
      if (state.journalFilter === id) state.journalFilter = null;
      saveJournals(); saveLocal();
      renderSettings(); renderSidebarLists();
    };
  });
}

function openJournalModal(existing) {
  const j = existing || { id: null, name: '', color: JOURNAL_COLORS[DB.journals.length % JOURNAL_COLORS.length] };
  let color = j.color;
  $('modal-title').textContent = existing ? 'Edit journal' : 'New journal';
  $('modal-body').innerHTML = `
    <div class="field">
      <label>Name</label>
      <input type="text" class="input" id="j-name" value="${esc(j.name)}" placeholder="Work, Gratitude, Travel…" maxlength="28">
    </div>
    <div class="field">
      <label>Color</label>
      <div class="swatches" id="j-colors">
        ${JOURNAL_COLORS.map(c => `<button class="swatch${c === color ? ' on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn-primary" id="j-save" style="flex:1">${existing ? 'Save' : 'Create'}</button>
      <button class="btn-secondary" id="j-cancel">Cancel</button>
    </div>`;
  openModal();
  setTimeout(() => $('j-name').focus(), 60);

  document.querySelectorAll('#j-colors .swatch').forEach(s => {
    s.onclick = () => {
      color = s.dataset.c;
      document.querySelectorAll('#j-colors .swatch').forEach(x => x.classList.toggle('on', x.dataset.c === color));
    };
  });
  $('j-cancel').onclick = closeModal;
  $('j-save').onclick = () => {
    const name = $('j-name').value.trim();
    if (!name) { $('j-name').focus(); return; }
    if (existing) { existing.name = name; existing.color = color; }
    else DB.journals.push({ id: uid(), name, color });
    saveJournals();
    closeModal();
    render();
    toast(existing ? 'Journal updated' : 'Journal created');
  };
}

/* ─── Editor ──────────────────────────────────────────────────── */

let autosaveTimer = null;

function blankEntry() {
  return {
    id: uid(),
    journalId: state.journalFilter || DB.journals[0].id,
    date: todayKey(),
    title: '', html: '', plain: '',
    mood: null, tags: [], photos: [], favorite: false, words: 0,
    promptIndex: promptFor(todayKey()),
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function openEditor(id) {
  state.isNew = !id;
  state.editing = id ? JSON.parse(JSON.stringify(DB.entries[id])) : blankEntry();
  const e = state.editing;

  $('editor-journal').innerHTML = DB.journals.map(j =>
    `<option value="${j.id}" ${j.id === e.journalId ? 'selected' : ''}>${esc(j.name)}</option>`).join('');
  $('editor-date-label').textContent = e.date === todayKey() ? 'Today' : fmt.med(e.date);
  $('editor-title').value = e.title || '';
  $('editor-body').innerHTML = e.html || '';
  $('save-hint').textContent = '';

  const showPrompt = !DB.prefs.hidePrompt && state.isNew;
  $('prompt-strip').classList.toggle('hidden', !showPrompt);
  if (showPrompt) $('prompt-text').textContent = PROMPTS[e.promptIndex != null ? e.promptIndex : promptFor(e.date)];

  $('editor-delete').style.display = state.isNew ? 'none' : '';
  $('editor-star').classList.toggle('on', !!e.favorite);

  renderMoodStrip();
  renderEditorTags();
  renderPhotoGrid();
  updateWordCount();
  refreshTagSuggestions();

  $('editor-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    if (state.isNew) $('editor-body').focus();
  }, 120);
}

function closeEditor(skipSave) {
  if (!skipSave) commitEditor(true);
  clearTimeout(autosaveTimer);
  $('editor-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  state.editing = null;
  render();
}

function readEditorInto(e) {
  e.title = $('editor-title').value.trim();
  e.html  = $('editor-body').innerHTML;
  e.plain = htmlToText(e.html);
  e.words = countWords(e.plain);
  e.journalId = $('editor-journal').value;
  e.updatedAt = Date.now();
}

function isEmptyEntry(e) {
  return !e.title && !e.plain && !(e.photos || []).length && !e.mood;
}

function commitEditor(closing) {
  const e = state.editing;
  if (!e) return;
  readEditorInto(e);

  if (isEmptyEntry(e)) {
    // Nothing worth keeping — drop it rather than saving a blank entry
    if (DB.entries[e.id]) { delete DB.entries[e.id]; saveLocal(); removeEntry(e.id); }
    return;
  }

  DB.entries[e.id] = JSON.parse(JSON.stringify(e));
  saveLocal();
  pushEntry(DB.entries[e.id]);
  if (!closing) {
    $('save-hint').textContent = 'Saved';
    setTimeout(() => { if ($('save-hint')) $('save-hint').textContent = ''; }, 1400);
  }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  $('save-hint').textContent = 'Saving…';
  autosaveTimer = setTimeout(() => commitEditor(false), 1100);
}

function renderMoodStrip() {
  const e = state.editing;
  $('mood-strip').innerHTML = MOODS.map(m => `
    <button class="mood-btn${e.mood === m.v ? ' on' : ''}" data-m="${m.v}" style="${e.mood === m.v ? 'color:' + m.c : ''}">
      ${moodSvg(m.v, 23)}<span>${m.l}</span>
    </button>`).join('');
  document.querySelectorAll('#mood-strip .mood-btn').forEach(b => {
    b.onclick = () => {
      const v = Number(b.dataset.m);
      e.mood = e.mood === v ? null : v;
      renderMoodStrip();
      scheduleAutosave();
    };
  });
}

function renderEditorTags() {
  const e = state.editing;
  $('editor-tags').innerHTML = (e.tags || []).map(t => `
    <span class="tag-pill">#${esc(t)}<button data-rm="${esc(t)}" aria-label="Remove tag">✕</button></span>`).join('');
  document.querySelectorAll('#editor-tags [data-rm]').forEach(b => {
    b.onclick = () => { e.tags = e.tags.filter(t => t !== b.dataset.rm); renderEditorTags(); scheduleAutosave(); };
  });
}

function refreshTagSuggestions() {
  $('tag-suggestions').innerHTML = allTags().map(t => `<option value="${esc(t.tag)}">`).join('');
}

function renderPhotoGrid() {
  const e = state.editing;
  $('photo-grid').innerHTML = (e.photos || []).map((p, i) => `
    <div class="photo-item">
      <img src="${p}" data-lb="${i}" alt="">
      <button class="photo-del" data-rmp="${i}" aria-label="Remove photo">
        <svg viewBox="0 0 24 24" class="ic"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join('');
  document.querySelectorAll('#photo-grid [data-rmp]').forEach(b => {
    b.onclick = () => { e.photos.splice(Number(b.dataset.rmp), 1); renderPhotoGrid(); scheduleAutosave(); };
  });
  document.querySelectorAll('#photo-grid [data-lb]').forEach(img => {
    img.onclick = () => openLightbox(img.src);
  });
}

function updateWordCount() {
  const n = countWords(htmlToText($('editor-body').innerHTML));
  $('word-count').textContent = n + (n === 1 ? ' word' : ' words');
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        let { width: w, height: h } = img;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = 0.8, out = c.toDataURL('image/jpeg', q);
        while (out.length > 320000 && q > 0.28) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function addPhotos(files) {
  const e = state.editing;
  if (!e) return;
  e.photos = e.photos || [];
  for (const f of Array.from(files).slice(0, 8)) {
    if (e.photos.length >= 12) { toast('Up to 12 photos per entry'); break; }
    try { e.photos.push(await compressImage(f)); } catch { toast('Could not read that image'); }
  }
  renderPhotoGrid();
  scheduleAutosave();
}

function syncFormatBar() {
  document.querySelectorAll('#format-bar [data-cmd]').forEach(b => {
    let on = false;
    try { on = document.queryCommandState(b.dataset.cmd); } catch {}
    b.classList.toggle('on', on);
  });
}

function wireEditor() {
  $('editor-close').onclick  = () => closeEditor();
  $('editor-save').onclick   = () => { closeEditor(); toast('Entry saved'); };
  $('editor-backdrop').addEventListener('click', ev => { if (ev.target.id === 'editor-backdrop') closeEditor(); });

  $('editor-title').addEventListener('input', scheduleAutosave);
  $('editor-journal').addEventListener('change', scheduleAutosave);

  const body = $('editor-body');
  body.addEventListener('input', () => { updateWordCount(); scheduleAutosave(); });
  body.addEventListener('keyup', syncFormatBar);
  body.addEventListener('mouseup', syncFormatBar);
  body.addEventListener('paste', ev => {
    ev.preventDefault();
    const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  document.querySelectorAll('#format-bar [data-cmd]').forEach(b => {
    b.onmousedown = ev => ev.preventDefault();
    b.onclick = () => { document.execCommand(b.dataset.cmd, false, null); body.focus(); syncFormatBar(); scheduleAutosave(); };
  });
  document.querySelectorAll('#format-bar [data-block]').forEach(b => {
    b.onmousedown = ev => ev.preventDefault();
    b.onclick = () => {
      const tag = b.dataset.block;
      const cur = document.queryCommandValue('formatBlock');
      document.execCommand('formatBlock', false, cur.toLowerCase() === tag ? 'p' : tag);
      body.focus(); scheduleAutosave();
    };
  });

  $('photo-btn').onclick = () => $('photo-input').click();
  $('photo-input').onchange = ev => { addPhotos(ev.target.files); ev.target.value = ''; };

  $('editor-star').onclick = () => {
    state.editing.favorite = !state.editing.favorite;
    $('editor-star').classList.toggle('on', state.editing.favorite);
    scheduleAutosave();
  };

  $('editor-delete').onclick = () => {
    if (!confirm('Delete this entry?')) return;
    const id = state.editing.id;
    delete DB.entries[id];
    saveLocal(); removeEntry(id);
    closeEditor(true);
    toast('Entry deleted');
  };

  $('editor-date-btn').onclick = () => {
    const e = state.editing;
    $('modal-title').textContent = 'Entry date';
    $('modal-body').innerHTML = `
      <div class="field">
        <label>Date</label>
        <input type="date" class="input" id="d-pick" value="${e.date}" max="${todayKey()}">
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn-primary" id="d-ok" style="flex:1">Set date</button>
        <button class="btn-secondary" id="d-cancel">Cancel</button>
      </div>`;
    openModal();
    $('d-cancel').onclick = closeModal;
    $('d-ok').onclick = () => {
      const v = $('d-pick').value;
      if (v) {
        e.date = v;
        $('editor-date-label').textContent = v === todayKey() ? 'Today' : fmt.med(v);
        scheduleAutosave();
      }
      closeModal();
    };
  };

  $('prompt-shuffle').onclick = () => {
    let i;
    do { i = Math.floor(Math.random() * PROMPTS.length); } while (i === state.editing.promptIndex && PROMPTS.length > 1);
    state.editing.promptIndex = i;
    $('prompt-text').textContent = PROMPTS[i];
  };
  $('prompt-hide').onclick = () => $('prompt-strip').classList.add('hidden');

  const ti = $('tag-input');
  ti.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      const v = ti.value.trim().replace(/^#/, '').slice(0, 24);
      if (v && !state.editing.tags.includes(v)) {
        state.editing.tags.push(v);
        renderEditorTags(); scheduleAutosave();
      }
      ti.value = '';
    } else if (ev.key === 'Backspace' && !ti.value && state.editing.tags.length) {
      state.editing.tags.pop();
      renderEditorTags(); scheduleAutosave();
    }
  });
}

/* ─── Viewer ──────────────────────────────────────────────────── */

function openViewer(id) {
  const e = DB.entries[id];
  if (!e) return;
  state.viewingId = id;
  const j = journalById(e.journalId);
  const m = mood(e.mood);

  $('viewer-date').textContent = fmt.full(e.date);
  $('viewer-star').classList.toggle('on', !!e.favorite);
  $('viewer-body').innerHTML = `
    ${e.title ? `<h1 class="v-title">${esc(e.title)}</h1>` : ''}
    <div class="v-meta">
      ${m ? `<span style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--text-2);font-weight:600">${moodSvg(m.v, 17)}${m.l}</span>` : ''}
      <span class="ec-journal" style="background:${j.color}1a;color:${j.color}">${esc(j.name)}</span>
      <span style="font-size:.76rem;color:var(--text-3)">${fmt.time(e.createdAt)} · ${e.words || 0} words</span>
    </div>
    <div class="v-body">${e.html || '<p style="color:var(--text-3)">No text in this entry.</p>'}</div>
    ${(e.photos || []).length ? `<div class="v-photos">${e.photos.map(p => `<img src="${p}" alt="">`).join('')}</div>` : ''}
    ${(e.tags || []).length ? `<div class="tag-list" style="margin-top:20px">${e.tags.map(t => `<span class="tag-pill">#${esc(t)}</span>`).join('')}</div>` : ''}`;

  document.querySelectorAll('#viewer-body .v-photos img').forEach(img => {
    img.onclick = () => openLightbox(img.src);
  });

  $('viewer-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeViewer() {
  $('viewer-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  state.viewingId = null;
}

function wireViewer() {
  $('viewer-close').onclick = closeViewer;
  $('viewer-backdrop').addEventListener('click', ev => { if (ev.target.id === 'viewer-backdrop') closeViewer(); });
  $('viewer-edit').onclick = () => { const id = state.viewingId; closeViewer(); openEditor(id); };
  $('viewer-star').onclick = () => {
    const e = DB.entries[state.viewingId];
    if (!e) return;
    e.favorite = !e.favorite;
    e.updatedAt = Date.now();
    saveLocal(); pushEntry(e);
    $('viewer-star').classList.toggle('on', e.favorite);
    render();
  };
}

/* ─── Lightbox / modal ────────────────────────────────────────── */

function openLightbox(src) {
  $('lightbox-img').src = src;
  $('lightbox').classList.add('open');
}
function closeLightbox() { $('lightbox').classList.remove('open'); }
function openModal()  { $('modal-backdrop').classList.add('open'); }
function closeModal() { $('modal-backdrop').classList.remove('open'); }

/* ─── Theme / sidebar ─────────────────────────────────────────── */

const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  $('theme-icon').innerHTML = dark ? SUN : MOON;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0E0F13' : '#6366F1');
}
function toggleTheme() {
  const dark = !document.body.classList.contains('dark');
  localStorage.setItem(LS.theme, dark ? 'dark' : 'light');
  applyTheme(dark);
}
function initTheme() {
  const saved = localStorage.getItem(LS.theme);
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(dark);
}

function openSidebar()  { $('sidebar').classList.add('open'); $('sidebar-scrim').classList.add('show'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebar-scrim').classList.remove('show'); }

/* ─── Wiring ──────────────────────────────────────────────────── */

function wireChrome() {
  document.querySelectorAll('.side-link[data-view]').forEach(b => { b.onclick = () => go(b.dataset.view); });
  document.querySelectorAll('.bn-item').forEach(b => { b.onclick = () => go(b.dataset.view); });
  $('settings-link').onclick = () => go('settings');
  $('compose-btn').onclick = () => { closeSidebar(); openEditor(); };
  $('fab-compose').onclick = () => openEditor();
  $('add-journal-btn').onclick = ev => { ev.stopPropagation(); openJournalModal(); };

  $('menu-btn').onclick = openSidebar;
  $('sidebar-close').onclick = closeSidebar;
  $('sidebar-scrim').onclick = closeSidebar;

  $('theme-toggle').onclick = toggleTheme;
  $('avatar-btn').onclick = () => go('settings');

  const si = $('search-input');
  let searchTimer = null;
  si.addEventListener('input', () => {
    $('search-clear').hidden = !si.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = si.value;
      if (state.view !== 'timeline' && state.view !== 'favorites') state.view = 'timeline';
      render();
    }, 180);
  });
  $('search-clear').onclick = () => {
    si.value = ''; state.search = '';
    $('search-clear').hidden = true;
    render(); si.focus();
  };

  $('modal-close').onclick = closeModal;
  $('modal-backdrop').addEventListener('click', ev => { if (ev.target.id === 'modal-backdrop') closeModal(); });
  $('lightbox').onclick = closeLightbox;

  document.addEventListener('keydown', ev => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;

    if (ev.key === 'Escape') {
      if ($('lightbox').classList.contains('open')) return closeLightbox();
      if ($('modal-backdrop').classList.contains('open')) return closeModal();
      if ($('editor-backdrop').classList.contains('open')) return closeEditor();
      if ($('viewer-backdrop').classList.contains('open')) return closeViewer();
      closeSidebar();
      return;
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && $('editor-backdrop').classList.contains('open')) {
      ev.preventDefault(); closeEditor(); toast('Entry saved'); return;
    }
    if (typing) return;
    if (ev.key === '/') { ev.preventDefault(); $('search-input').focus(); }
    if (ev.key === 'n') { ev.preventDefault(); openEditor(); }
  });

  window.addEventListener('beforeunload', () => {
    if (state.editing && $('editor-backdrop').classList.contains('open')) commitEditor(true);
  });
}

/* ─── Init ────────────────────────────────────────────────────── */

let appReady = false;

function startApp() {
  $('boot').classList.add('hide');
  $('app').classList.add('show');
  if (appReady) { render(); return; }
  appReady = true;
  wireChrome();
  wireEditor();
  wireViewer();
  render();
}

function init() {
  initTheme();
  loadLocal();

  const btn = $('google-signin-btn');
  const err = $('signin-error');

  btn.onclick = () => {
    btn.disabled = true;
    err.textContent = '';
    const provider = new firebase.auth.GoogleAuthProvider();
    fbAuth.signInWithPopup(provider).catch(e => {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        fbAuth.signInWithRedirect(provider);
      } else {
        err.textContent = e.message || e.code;
        btn.disabled = false;
      }
    });
  };

  fbAuth.getRedirectResult().catch(e => {
    if (e && e.code !== 'auth/no-auth-event') err.textContent = e.message || e.code;
  });

  fbAuth.onAuthStateChanged(async user => {
    fbUser = user;
    if (!user) {
      $('boot').classList.add('hide');
      $('app').classList.remove('show');
      $('auth-gate').classList.add('show');
      btn.disabled = false;
      return;
    }
    $('auth-gate').classList.remove('show');

    const av = $('avatar-inner');
    if (user.photoURL) {
      $('avatar-btn').innerHTML = '<img src="' + user.photoURL + '" referrerpolicy="no-referrer" alt="">';
    } else if (av) {
      av.textContent = (user.email || 'U')[0].toUpperCase();
    }

    await pullAll();
    startApp();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && fbUser && !state.editing) {
      pullAll().then(() => { if (appReady) render(); });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
