/**
 * background.js — FeedFilter Service Worker (no ES module imports)
 */

const MSG = {
  SETTINGS_UPDATED:  'SETTINGS_UPDATED',
  TIME_LIMIT_REACHED:'TIME_LIMIT_REACHED',
  SAVE_POST:         'SAVE_POST',
  MUTE_ACCOUNT:      'MUTE_ACCOUNT',
};

const DEFAULT_SETTINGS = {
  isEnabled: true, keywords: [], mutedAccounts: [], savedPosts: [],
  timeLimit: 0, timeSpentToday: 0, timeTrackedDate: '', minLikes: 0, showPlaceholder: true,
};

const ALARM_NAME = 'feedfilter-timer';

// ─── Install ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Init storage defaults
  const existing = await chrome.storage.sync.get(null);
  const missing = {};
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in existing)) missing[key] = val;
  }
  if (Object.keys(missing).length > 0) await chrome.storage.sync.set(missing);

  setupContextMenus();
  setupAlarms();
  console.log('[FeedFilter] Installed.');
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  setupContextMenus();
});

// ─── Alarms ───────────────────────────────────────────────────
function setupAlarms() {
  chrome.alarms.get(ALARM_NAME, alarm => {
    if (!alarm) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;

  const tabs = await chrome.tabs.query({});
  const twitterTabs = tabs.filter(t => t.active && t.url &&
    (t.url.includes('twitter.com') || t.url.includes('x.com')));
  if (twitterTabs.length === 0) return;

  const today = new Date().toISOString().split('T')[0];
  const data = await chrome.storage.sync.get(['timeLimit','timeSpentToday','timeTrackedDate']);
  const base = data.timeTrackedDate === today ? (data.timeSpentToday || 0) : 0;
  const newTime = base + 1;

  await chrome.storage.sync.set({ timeSpentToday: newTime, timeTrackedDate: today });

  if (data.timeLimit > 0 && newTime >= data.timeLimit) {
    twitterTabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: MSG.TIME_LIMIT_REACHED,
        minutesSpent: newTime,
        limit: data.timeLimit,
      }).catch(() => {});
    });
  }
});

// ─── Context Menus ────────────────────────────────────────────
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'mute-account', title: 'FeedFilter: Mute this account',
      contexts: ['page'], documentUrlPatterns: ['https://twitter.com/*','https://x.com/*'],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'mute-account') {
    chrome.tabs.sendMessage(tab.id, { type: MSG.MUTE_ACCOUNT, source: 'contextMenu' }).catch(() => {});
  }
});

// ─── Messages ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(message) {
  switch (message.type) {

    case MSG.SAVE_POST: {
      const { savedPosts = [] } = await chrome.storage.sync.get({ savedPosts: [] });
      if (savedPosts.find(p => p.id === message.post.id)) return { success: true };
      const updated = [message.post, ...savedPosts].slice(0, 200);
      await chrome.storage.sync.set({ savedPosts: updated });
      return { success: true, count: updated.length };
    }

    case MSG.MUTE_ACCOUNT: {
      if (!message.handle) return { success: false };
      const { mutedAccounts = [] } = await chrome.storage.sync.get({ mutedAccounts: [] });
      const handle = message.handle.replace('@','').toLowerCase().trim();
      if (!mutedAccounts.includes(handle)) {
        const updated = [...mutedAccounts, handle];
        await chrome.storage.sync.set({ mutedAccounts: updated });
      }
      broadcastToTwitterTabs({ type: MSG.SETTINGS_UPDATED });
      return { success: true };
    }

    case MSG.SETTINGS_UPDATED: {
      broadcastToTwitterTabs({ type: MSG.SETTINGS_UPDATED });
      return { success: true };
    }

    default:
      return { error: 'Unknown message: ' + message.type };
  }
}

async function broadcastToTwitterTabs(message) {
  const tabs = await chrome.tabs.query({ url: ['https://twitter.com/*','https://x.com/*'] });
  tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
}
