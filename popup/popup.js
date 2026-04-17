/**
 * popup.js — FeedFilter Popup (no ES module imports)
 */

const MSG = { SETTINGS_UPDATED: 'SETTINGS_UPDATED' };

const DEFAULT_SETTINGS = {
  isEnabled: true, keywords: [], mutedAccounts: [], savedPosts: [],
  timeLimit: 0, timeSpentToday: 0, timeTrackedDate: '', minLikes: 0, showPlaceholder: true,
};

// ─── Storage Helpers ──────────────────────────────────────────
async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(DEFAULT_SETTINGS, resolve));
}
async function setSettings(partial) {
  return new Promise(resolve => chrome.storage.sync.set(partial, resolve));
}

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatMinutes(m) {
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60), rem = m % 60;
  return rem === 0 ? h + 'h' : h + 'h ' + rem + 'm';
}

function setStatus(msg, duration = 2000) {
  const el = document.getElementById('status-msg');
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { el.textContent = 'Ready'; }, duration);
}

function broadcastUpdate() {
  chrome.runtime.sendMessage({ type: MSG.SETTINGS_UPDATED }).catch(() => {});
}

function createTag(label, onRemove) {
  const li = document.createElement('li');
  li.className = 'tag';
  li.innerHTML = '<span>' + escapeHtml(label) + '</span><button class="tag__remove" title="Remove">✕</button>';
  li.querySelector('.tag__remove').addEventListener('click', onRemove);
  return li;
}

// ─── Render Functions ─────────────────────────────────────────
function renderMasterToggle(isEnabled) {
  const el = document.getElementById('master-toggle');
  if (el) el.checked = isEnabled;
}

function renderKeywords(keywords) {
  const list = document.getElementById('keyword-list');
  const badge = document.getElementById('keyword-count');
  if (badge) badge.textContent = keywords.length;
  if (!list) return;
  list.innerHTML = '';
  keywords.forEach(kw => {
    list.appendChild(createTag(kw, async () => {
      const { keywords: kws } = await new Promise(r => chrome.storage.sync.get({ keywords: [] }, r));
      const updated = kws.filter(k => k !== kw);
      await setSettings({ keywords: updated });
      renderKeywords(updated);
      broadcastUpdate();
      setStatus('Removed "' + kw + '"');
    }));
  });
}

function renderAccounts(accounts) {
  const list = document.getElementById('account-list');
  const badge = document.getElementById('account-count');
  if (badge) badge.textContent = accounts.length;
  if (!list) return;
  list.innerHTML = '';
  accounts.forEach(handle => {
    list.appendChild(createTag('@' + handle, async () => {
      const { mutedAccounts } = await new Promise(r => chrome.storage.sync.get({ mutedAccounts: [] }, r));
      const updated = mutedAccounts.filter(a => a !== handle);
      await setSettings({ mutedAccounts: updated });
      renderAccounts(updated);
      broadcastUpdate();
      setStatus('Unmuted @' + handle);
    }));
  });
}

function renderMinLikes(minLikes) {
  const el = document.getElementById('min-likes-input');
  if (el) el.value = minLikes || '';
}

function renderPlaceholderToggle(val) {
  const el = document.getElementById('placeholder-toggle');
  if (el) el.checked = val;
}

async function renderSavedPosts() {
  const { savedPosts } = await new Promise(r => chrome.storage.sync.get({ savedPosts: [] }, r));
  const list = document.getElementById('saved-list');
  if (!list) return;

  if (!savedPosts.length) {
    list.innerHTML = '<li class="empty-state">No saved posts yet.<br>Click 🔖 on any tweet to save it.</li>';
    return;
  }

  list.innerHTML = '';
  savedPosts.forEach(post => {
    const li = document.createElement('li');
    li.className = 'saved-item';
    li.innerHTML = '<div class="saved-item__body"><div class="saved-item__author">@' + escapeHtml(post.handle || post.author) + '</div><div class="saved-item__text">' + escapeHtml((post.text || '').slice(0, 120)) + '</div>' + (post.url ? '<a class="saved-item__link" href="' + post.url + '" target="_blank">Open tweet ↗</a>' : '') + '</div><button class="saved-item__remove" title="Remove">✕</button>';
    li.querySelector('.saved-item__remove').addEventListener('click', async () => {
      const { savedPosts: sp } = await new Promise(r => chrome.storage.sync.get({ savedPosts: [] }, r));
      await setSettings({ savedPosts: sp.filter(p => p.id !== post.id) });
      renderSavedPosts();
      setStatus('Post removed');
    });
    list.appendChild(li);
  });
}

async function renderTimeTab() {
  const data = await new Promise(r => chrome.storage.sync.get({ timeLimit: 0, timeSpentToday: 0 }, r));
  const limitEl = document.getElementById('time-limit-input');
  const spentEl = document.getElementById('time-spent');
  if (limitEl) limitEl.value = data.timeLimit || '';
  if (spentEl) spentEl.textContent = data.timeSpentToday > 0 ? formatMinutes(data.timeSpentToday) : '0m';
}

// ─── Setup (Event Listeners) ──────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('tab-panel--hidden'));
      tab.classList.add('tab--active');
      const panel = document.getElementById('tab-' + tab.dataset.tab);
      if (panel) panel.classList.remove('tab-panel--hidden');
    });
  });
}

function setupMasterToggle() {
  const el = document.getElementById('master-toggle');
  if (!el) return;
  el.addEventListener('change', async e => {
    await setSettings({ isEnabled: e.target.checked });
    broadcastUpdate();
    setStatus(e.target.checked ? 'FeedFilter enabled' : 'FeedFilter paused');
  });
}

function setupKeywords() {
  const input = document.getElementById('keyword-input');
  const btn   = document.getElementById('add-keyword-btn');
  if (!input || !btn) return;

  const add = async () => {
    const val = input.value.trim().toLowerCase();
    if (!val) return;
    const { keywords } = await new Promise(r => chrome.storage.sync.get({ keywords: [] }, r));
    if (keywords.includes(val)) { input.value = ''; return; }
    const updated = [...keywords, val];
    await setSettings({ keywords: updated });
    input.value = '';
    renderKeywords(updated);
    broadcastUpdate();
    setStatus('Added "' + val + '"');
  };

  btn.addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
}

function setupAccounts() {
  const input = document.getElementById('account-input');
  const btn   = document.getElementById('add-account-btn');
  if (!input || !btn) return;

  const add = async () => {
    const val = input.value.replace('@','').trim().toLowerCase();
    if (!val) return;
    const { mutedAccounts } = await new Promise(r => chrome.storage.sync.get({ mutedAccounts: [] }, r));
    if (mutedAccounts.includes(val)) { input.value = ''; return; }
    const updated = [...mutedAccounts, val];
    await setSettings({ mutedAccounts: updated });
    input.value = '';
    renderAccounts(updated);
    broadcastUpdate();
    setStatus('Muted @' + val);
  };

  btn.addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
}

function setupMinLikes() {
  const btn = document.getElementById('save-likes-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const val = parseInt(document.getElementById('min-likes-input').value, 10);
    const minLikes = isNaN(val) ? 0 : Math.max(0, val);
    await setSettings({ minLikes });
    broadcastUpdate();
    setStatus(minLikes > 0 ? 'Min likes set to ' + minLikes : 'Min likes disabled');
  });
}

function setupPlaceholderToggle() {
  const el = document.getElementById('placeholder-toggle');
  if (!el) return;
  el.addEventListener('change', async e => {
    await setSettings({ showPlaceholder: e.target.checked });
    broadcastUpdate();
  });
}

function setupSavedPosts() {
  const btn = document.getElementById('clear-saved-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('Clear all saved posts?')) return;
    await setSettings({ savedPosts: [] });
    renderSavedPosts();
    setStatus('Cleared saved posts');
  });
}

function setupTimeTab() {
  const saveBtn  = document.getElementById('save-time-btn');
  const resetBtn = document.getElementById('reset-time-btn');

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const val = parseInt(document.getElementById('time-limit-input').value, 10);
      const timeLimit = isNaN(val) ? 0 : Math.max(0, val);
      await setSettings({ timeLimit });
      setStatus(timeLimit > 0 ? 'Limit set: ' + formatMinutes(timeLimit) : 'Time limit disabled');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const today = new Date().toISOString().split('T')[0];
      await setSettings({ timeSpentToday: 0, timeTrackedDate: today });
      renderTimeTab();
      setStatus('Timer reset');
    });
  }
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  const s = await getSettings();
  renderMasterToggle(s.isEnabled);
  renderKeywords(s.keywords);
  renderAccounts(s.mutedAccounts);
  renderMinLikes(s.minLikes);
  renderPlaceholderToggle(s.showPlaceholder);
  await renderSavedPosts();
  await renderTimeTab();

  setupTabs();
  setupMasterToggle();
  setupKeywords();
  setupAccounts();
  setupMinLikes();
  setupPlaceholderToggle();
  setupSavedPosts();
  setupTimeTab();
}

document.addEventListener('DOMContentLoaded', init);
