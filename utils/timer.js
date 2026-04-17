/**
 * timer.js
 * ─────────────────────────────────────────────────────────────
 * Time-on-site tracking logic.
 *
 * HOW IT WORKS:
 *   background.js creates a periodic chrome.alarms tick every
 *   1 minute. Each tick calls tickMinute() here, which increments
 *   storage and checks against the limit.
 *
 *   The content script listens for a TIME_LIMIT_REACHED message
 *   and shows the overlay.
 *
 * TO ADD A NEW TIME-BASED FEATURE:
 *   Add logic inside tickMinute() or subscribe to the
 *   TIME_LIMIT_REACHED message in content.js.
 * ─────────────────────────────────────────────────────────────
 */

import { getTimeData, incrementTimeSpent } from './storage.js';

export const ALARM_NAME = 'feedfilter-timer';
export const ALARM_PERIOD_MINUTES = 1;

/**
 * Called every minute by the background alarm.
 * Increments time, checks limit, notifies content script if hit.
 */
export async function tickMinute(tabs) {
  // Only count time if the user is actively on Twitter/X
  const twitterTabs = tabs.filter(tab =>
    tab.active &&
    tab.url &&
    (tab.url.includes('twitter.com') || tab.url.includes('x.com'))
  );

  if (twitterTabs.length === 0) return;

  await incrementTimeSpent(ALARM_PERIOD_MINUTES);

  const { timeLimit, timeSpentToday } = await getTimeData();
  if (timeLimit > 0 && timeSpentToday >= timeLimit) {
    // Notify all active Twitter tabs
    for (const tab of twitterTabs) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TIME_LIMIT_REACHED',
        minutesSpent: timeSpentToday,
        limit: timeLimit,
      }).catch(() => {}); // tab may not have content script loaded yet
    }
  }
}

/**
 * Format minutes into a readable string.
 * e.g. 75 → "1h 15m", 30 → "30m"
 */
export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
