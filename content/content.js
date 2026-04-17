/**
 * content.js — FeedFilter (self-contained, no ES module imports)
 */

const MSG = {
  SETTINGS_UPDATED:   'SETTINGS_UPDATED',
  TIME_LIMIT_REACHED: 'TIME_LIMIT_REACHED',
  SAVE_POST:          'SAVE_POST',
  MUTE_ACCOUNT:       'MUTE_ACCOUNT',
};

const SEL = {
  tweet:        'article[data-testid="tweet"]',
  tweetText:    '[data-testid="tweetText"]',
  authorName:   '[data-testid="User-Name"]',
  likeCount:    '[data-testid="like"] span[data-testid="app-text-transition-container"]',
  timeLink:     'time[datetime]',
  avatarLink:   'a[role="link"][href*="/"][tabindex="-1"]',
};

const DEFAULT_SETTINGS = {
  isEnabled: true, keywords: [], mutedAccounts: [], savedPosts: [],
  timeLimit: 0, timeSpentToday: 0, timeTrackedDate: '', minLikes: 0, showPlaceholder: true,
};

let settings = {};
let observer = null;

async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(DEFAULT_SETTINGS, resolve));
}

function parseTwitterCount(str) {
  if (!str) return null;
  const s = str.trim().replace(',', '');
  if (s.endsWith('K')) return Math.round(parseFloat(s) * 1000);
  if (s.endsWith('M')) return Math.round(parseFloat(s) * 1000000);
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function shouldHideTweet(tweet, cfg) {
  if (!cfg.isEnabled) return { hide: false, reason: null };
  if (cfg.mutedAccounts && cfg.mutedAccounts.length > 0) {
    const handle = (tweet.handle || '').toLowerCase().replace('@', '');
    if (handle && cfg.mutedAccounts.includes(handle))
      return { hide: true, reason: 'Muted account: @' + handle };
  }
  if (cfg.keywords && cfg.keywords.length > 0) {
    const haystack = ((tweet.text || '') + ' ' + (tweet.author || '')).toLowerCase();
    const matched = cfg.keywords.find(kw => haystack.includes(kw));
    if (matched) return { hide: true, reason: 'Blocked keyword: "' + matched + '"' };
  }
  if (cfg.minLikes > 0 && tweet.likeCount !== null && tweet.likeCount < cfg.minLikes)
    return { hide: true, reason: 'Below min likes (' + tweet.likeCount + ' < ' + cfg.minLikes + ')' };
  return { hide: false, reason: null };
}

function parseTweet(el) {
  const textEl     = el.querySelector(SEL.tweetText);
  const authorEl   = el.querySelector(SEL.authorName);
  const likeEl     = el.querySelector(SEL.likeCount);
  const timeEl     = el.querySelector(SEL.timeLink);
  const avatarLink = el.querySelector(SEL.avatarLink);
  const tweetUrl   = timeEl?.closest('a')?.href ?? null;
  const id         = tweetUrl?.match(/\/status\/(\d+)/)?.[1] ?? null;
  const handleRaw  = avatarLink?.getAttribute('href');
  const handle     = handleRaw ? handleRaw.split('/').filter(Boolean)[0] : null;
  const authorSpans = authorEl?.querySelectorAll('span');
  return {
    id, handle, url: tweetUrl,
    text:      textEl?.innerText?.trim() ?? null,
    author:    authorSpans?.[0]?.textContent?.trim() ?? null,
    likeCount: parseTwitterCount(likeEl?.textContent),
  };
}

function createPlaceholder(reason) {
  const div = document.createElement('div');
  div.className = 'ff-placeholder';
  div.innerHTML = '<span class="ff-placeholder__icon">⊘</span><span class="ff-placeholder__reason">' + (reason || 'Hidden by FeedFilter') + '</span>';
  return div;
}

function hideTweet(el, reason) {
  el.style.display = 'none';
  if (settings.showPlaceholder) {
    const next = el.nextSibling;
    if (!next || !next.classList?.contains('ff-placeholder'))
      el.parentNode?.insertBefore(createPlaceholder(reason), el.nextSibling);
  }
}

function showTweet(el) { el.style.display = ''; }

function injectTweetActions(el, tweet) {
  if (el.querySelector('.ff-actions')) return;
  const bar = document.createElement('div');
  bar.className = 'ff-actions';

  if (tweet.handle) {
    const muteBtn = document.createElement('button');
    muteBtn.className = 'ff-btn ff-btn--mute';
    muteBtn.textContent = '🚫 @' + tweet.handle;
    muteBtn.addEventListener('click', e => { e.stopPropagation(); handleMuteAccount(tweet.handle); });
    bar.appendChild(muteBtn);
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'ff-btn ff-btn--save';
  saveBtn.textContent = '🔖 Save';
  saveBtn.addEventListener('click', e => { e.stopPropagation(); handleSavePost(tweet, saveBtn); });
  bar.appendChild(saveBtn);
  el.appendChild(bar);
}

function scanFeed() {
  document.querySelectorAll(SEL.tweet).forEach(el => {
    if (el.dataset.ffProcessed) return;
    const tweet = parseTweet(el);
    const { hide, reason } = shouldHideTweet(tweet, settings);
    el.dataset.ffProcessed = 'true';
    el.dataset.ffHidden = String(hide);
    if (hide) { hideTweet(el, reason); }
    else { showTweet(el); injectTweetActions(el, tweet); }
  });
}

function handleSavePost(tweet, btn) {
  const post = {
    id: tweet.id ?? String(Date.now()), url: tweet.url ?? window.location.href,
    text: tweet.text ?? '', author: tweet.author ?? '', handle: tweet.handle ?? '',
    savedAt: new Date().toISOString(),
  };
  chrome.runtime.sendMessage({ type: MSG.SAVE_POST, post }, res => {
    if (res && res.success) {
      btn.textContent = '✅ Saved'; btn.disabled = true;
      setTimeout(() => { btn.textContent = '🔖 Save'; btn.disabled = false; }, 2000);
    }
  });
}

function handleMuteAccount(handle) {
  chrome.runtime.sendMessage({ type: MSG.MUTE_ACCOUNT, handle }, async () => {
    settings = await getSettings();
    document.querySelectorAll(SEL.tweet).forEach(el => {
      const t = parseTweet(el);
      if ((t.handle || '').toLowerCase() === handle.toLowerCase()) {
        delete el.dataset.ffProcessed;
        el.dataset.ffHidden = 'true';
        hideTweet(el, 'Muted account: @' + handle);
      }
    });
  });
}

function showTimeLimitOverlay(minutesSpent, limit) {
  if (document.getElementById('ff-time-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'ff-time-overlay';
  overlay.innerHTML = '<div class="ff-overlay__card"><div class="ff-overlay__icon">⏱</div><h2 class="ff-overlay__title">Time\'s up!</h2><p class="ff-overlay__body">You\'ve spent <strong>' + minutesSpent + ' minutes</strong> on Twitter today.<br>Your limit is <strong>' + limit + ' minutes</strong>.</p><button class="ff-overlay__snooze" id="ff-snooze-btn">Snooze 5 minutes</button><button class="ff-overlay__dismiss" id="ff-dismiss-btn">Dismiss</button></div>';
  document.body.appendChild(overlay);
  document.getElementById('ff-snooze-btn').addEventListener('click', () => overlay.remove());
  document.getElementById('ff-dismiss-btn').addEventListener('click', () => overlay.remove());
}

async function handleSettingsUpdate() {
  settings = await getSettings();
  document.querySelectorAll(SEL.tweet).forEach(el => {
    delete el.dataset.ffProcessed; delete el.dataset.ffHidden; el.style.display = '';
  });
  document.querySelectorAll('.ff-placeholder').forEach(p => p.remove());
  document.querySelectorAll('.ff-actions').forEach(a => a.remove());
  scanFeed();
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === MSG.SETTINGS_UPDATED) handleSettingsUpdate();
  if (message.type === MSG.TIME_LIMIT_REACHED) showTimeLimitOverlay(message.minutesSpent, message.limit);
});

async function init() {
  settings = await getSettings();
  scanFeed();
  let debounceTimer = null;
  observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanFeed, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

init();
