/**
 * messages.js
 * ─────────────────────────────────────────────────────────────
 * Message type constants shared across background, content, and popup.
 *
 * WHY THIS EXISTS:
 *   Hardcoded strings like 'SETTINGS_UPDATED' scattered across
 *   3 files is a bug waiting to happen. One typo = silent failure.
 *   Import from here everywhere instead.
 *
 * HOW TO ADD A NEW MESSAGE:
 *   1. Add a constant below
 *   2. Send it with: chrome.runtime.sendMessage({ type: MSG.YOUR_NEW_MSG, ...data })
 *   3. Handle it in the relevant listener
 * ─────────────────────────────────────────────────────────────
 */

export const MSG = Object.freeze({
  // Settings changed in popup → content script needs to re-filter
  SETTINGS_UPDATED:    'SETTINGS_UPDATED',

  // Background → content: user hit their time limit
  TIME_LIMIT_REACHED:  'TIME_LIMIT_REACHED',

  // Content → background: user clicked "Save post"
  SAVE_POST:           'SAVE_POST',

  // Content → background: user right-clicked "Mute @handle"
  MUTE_ACCOUNT:        'MUTE_ACCOUNT',

  // Popup → background: request current badge/stats
  GET_STATS:           'GET_STATS',

  // Background → popup: stats response
  STATS_RESPONSE:      'STATS_RESPONSE',
});
