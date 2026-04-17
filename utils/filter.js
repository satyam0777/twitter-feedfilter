/**
 * filter.js
 * ─────────────────────────────────────────────────────────────
 * Pure filtering logic — no DOM, no storage, no Chrome APIs.
 *
 * WHY THIS EXISTS:
 *   All matching rules live here. If you want to add a new filter
 *   type (regex support, language filter, sentiment filter), you:
 *   1. Add your matcher function below
 *   2. Add it to shouldHideTweet()
 *   That's it. content.js never changes.
 *
 * TESTING:
 *   Because this file has zero side effects, you can unit-test it
 *   in Node.js without any browser globals.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Main entry point.
 * Given a parsed tweet and current settings, returns true if the
 * tweet should be hidden.
 *
 * @param {TweetData} tweet   - parsed tweet object (see parseTweet in content.js)
 * @param {object}    settings - subset of storage settings
 * @returns {{ hide: boolean, reason: string|null }}
 */
export function shouldHideTweet(tweet, settings) {
  if (!settings.isEnabled) return { hide: false, reason: null };

  // Each check returns a reason string or null.
  // Order matters — first match wins (most specific → least specific).
  const checks = [
    () => checkMutedAccount(tweet, settings.mutedAccounts),
    () => checkKeywords(tweet, settings.keywords),
    () => checkMinLikes(tweet, settings.minLikes),
    // ── Add new filter functions here in the future ──
    // () => checkLanguage(tweet, settings.blockedLanguages),
    // () => checkSentiment(tweet, settings.sentimentThreshold),
  ];

  for (const check of checks) {
    const reason = check();
    if (reason) return { hide: true, reason };
  }

  return { hide: false, reason: null };
}

// ─── Individual Filter Functions ──────────────────────────────
// Each returns a human-readable reason string if the tweet should
// be hidden, or null if it should be shown.

/**
 * Hide tweets from muted accounts.
 * @param {TweetData} tweet
 * @param {string[]}  mutedAccounts - lowercase handles without @
 */
function checkMutedAccount(tweet, mutedAccounts) {
  if (!mutedAccounts?.length) return null;
  const handle = tweet.handle?.toLowerCase().replace('@', '') ?? '';
  return mutedAccounts.includes(handle)
    ? `Muted account: @${handle}`
    : null;
}

/**
 * Hide tweets containing blocked keywords.
 * Matches against tweet text + author display name.
 * Case-insensitive, partial word match.
 * @param {TweetData} tweet
 * @param {string[]}  keywords - lowercase keyword strings
 */
function checkKeywords(tweet, keywords) {
  if (!keywords?.length) return null;

  const haystack = [
    tweet.text ?? '',
    tweet.author ?? '',
  ].join(' ').toLowerCase();

  const matched = keywords.find(kw => haystack.includes(kw));
  return matched ? `Blocked keyword: "${matched}"` : null;
}

/**
 * Hide tweets below a minimum engagement threshold.
 * @param {TweetData} tweet
 * @param {number}    minLikes - 0 = disabled
 */
function checkMinLikes(tweet, minLikes) {
  if (!minLikes || minLikes <= 0) return null;
  if (tweet.likeCount === null) return null; // unknown — show it
  return tweet.likeCount < minLikes
    ? `Below min likes (${tweet.likeCount} < ${minLikes})`
    : null;
}

// ─── Utility Helpers ──────────────────────────────────────────

/**
 * Parse a Twitter shorthand number like "1.2K", "4.5M", "34" → integer.
 * Returns null if unparseable.
 */
export function parseTwitterCount(str) {
  if (!str) return null;
  const s = str.trim().replace(',', '');
  if (s.endsWith('K')) return Math.round(parseFloat(s) * 1_000);
  if (s.endsWith('M')) return Math.round(parseFloat(s) * 1_000_000);
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}
