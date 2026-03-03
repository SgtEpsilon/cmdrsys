/**
 * storage.js — Persistent storage abstraction.
 *
 * In production (Capacitor), swap the localStorage calls for:
 *   import { Preferences } from '@capacitor/preferences';
 *   await Preferences.set({ key, value: JSON.stringify(data) });
 *   const { value } = await Preferences.get({ key });
 *
 * For web/dev we use localStorage directly.
 */

const PREFIX = 'cmdrsys_';

export const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  async remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      return true;
    } catch {
      return false;
    }
  },
};

// ── Typed helpers ────────────────────────────────────────────────

export async function getLogs() {
  return (await storage.get('logs')) || [];
}
export async function saveLogs(logs) {
  return storage.set('logs', logs);
}

export async function getBookmarks() {
  return (await storage.get('bookmarks')) || [];
}
export async function saveBookmarks(bms) {
  return storage.set('bookmarks', bms);
}

export async function getVisited() {
  return (await storage.get('visited')) || [];
}
export async function saveVisited(visited) {
  return storage.set('visited', visited);
}

export async function getSettings() {
  return (await storage.get('settings')) || {};
}
export async function saveSettings(settings) {
  return storage.set('settings', settings);
}
