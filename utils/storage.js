/**
 * storage.js
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for all chrome.storage.sync operations.
 *
 * WHY THIS EXISTS:
 *   If chrome.storage API ever changes, or you add sync→local
 *   fallback, or you add encryption — you only change THIS file.
 *   Nothing else needs to know where or how data is stored.
 *
 * HOW TO ADD A NEW SETTING:
 *   1. Add it to DEFAULT_SETTINGS below
 *   2. Add a getter + setter function (follow existing pattern)
 *   3. Done. Storage is automatically initialized on first install.
 * ─────────────────────────────────────────────────────────────
 */

// ─── Schema / Defaults ────────────────────────────────────────
// This is the single place that defines the shape of all stored data.
// New features: add your key+default here first.
export const DEFAULT_SETTINGS = {
  isEnabled:      true,          // Master on/off switch
  keywords:       [],            // string[] — blocked keywords
  mutedAccounts:  [],            // string[] — muted @handles (without @)
  savedPosts:     [],            // SavedPost[] — read-later list
  timeLimit:      0,             // minutes; 0 = disabled
  timeSpentToday: 0,             // minutes tracked today
  timeTrackedDate: '',           // 'YYYY-MM-DD' — resets daily
  minLikes:       0,             // engagement filter; 0 = disabled
  showPlaceholder: true,         // show "hidden by FeedFilter" stub
};

// ─── Core Helpers ─────────────────────────────────────────────

/** Read one or more keys. Falls back to defaults for missing keys. */
export async function getSettings(keys = null) {
  const defaults = keys
    ? Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys]).map(k => [k, DEFAULT_SETTINGS[k]])
      )
    : { ...DEFAULT_SETTINGS };

  return chrome.storage.sync.get(defaults);
}

/** Write a partial settings object. Only the provided keys are updated. */
export async function setSettings(partial) {
  return chrome.storage.sync.set(partial);
}

/** Initialize storage on first install — sets all defaults at once. */
export async function initStorage() {
  const existing = await chrome.storage.sync.get(null);
  const missing = {};

  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in existing)) missing[key] = val;
  }

  if (Object.keys(missing).length > 0) {
    await chrome.storage.sync.set(missing);
  }
}

// ─── Feature-Specific Helpers ─────────────────────────────────
// These wrap getSettings/setSettings with domain logic.
// Keep business logic here, not scattered in content/popup files.

/** Keywords */
export async function getKeywords() {
  const { keywords } = await getSettings('keywords');
  return keywords;
}

export async function addKeyword(word) {
  const keywords = await getKeywords();
  const normalized = word.trim().toLowerCase();
  if (!normalized || keywords.includes(normalized)) return keywords;
  const updated = [...keywords, normalized];
  await setSettings({ keywords: updated });
  return updated;
}

export async function removeKeyword(word) {
  const keywords = await getKeywords();
  const updated = keywords.filter(k => k !== word.trim().toLowerCase());
  await setSettings({ keywords: updated });
  return updated;
}

/** Muted Accounts */
export async function getMutedAccounts() {
  const { mutedAccounts } = await getSettings('mutedAccounts');
  return mutedAccounts;
}

export async function muteAccount(handle) {
  const accounts = await getMutedAccounts();
  const normalized = handle.replace('@', '').toLowerCase().trim();
  if (!normalized || accounts.includes(normalized)) return accounts;
  const updated = [...accounts, normalized];
  await setSettings({ mutedAccounts: updated });
  return updated;
}

export async function unmuteAccount(handle) {
  const accounts = await getMutedAccounts();
  const normalized = handle.replace('@', '').toLowerCase().trim();
  const updated = accounts.filter(a => a !== normalized);
  await setSettings({ mutedAccounts: updated });
  return updated;
}

/** Saved Posts (Read Later) */
export async function getSavedPosts() {
  const { savedPosts } = await getSettings('savedPosts');
  return savedPosts;
}

export async function savePost(post) {
  // post shape: { id, url, text, author, handle, savedAt }
  const posts = await getSavedPosts();
  if (posts.find(p => p.id === post.id)) return posts; // dedupe
  const updated = [post, ...posts].slice(0, 200); // cap at 200
  await setSettings({ savedPosts: updated });
  return updated;
}

export async function removeSavedPost(postId) {
  const posts = await getSavedPosts();
  const updated = posts.filter(p => p.id !== postId);
  await setSettings({ savedPosts: updated });
  return updated;
}

/** Time Tracking */
export async function getTimeData() {
  return getSettings(['timeLimit', 'timeSpentToday', 'timeTrackedDate']);
}

export async function incrementTimeSpent(minutes) {
  const today = new Date().toISOString().split('T')[0];
  const { timeSpentToday, timeTrackedDate } = await getTimeData();

  // Reset daily counter if it's a new day
  const base = timeTrackedDate === today ? timeSpentToday : 0;
  await setSettings({
    timeSpentToday: base + minutes,
    timeTrackedDate: today,
  });
}

export async function resetTimeToday() {
  const today = new Date().toISOString().split('T')[0];
  await setSettings({ timeSpentToday: 0, timeTrackedDate: today });
}
