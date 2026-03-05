/**
 * storage.js — Persistent storage using @capacitor/preferences.
 *
 * Preferences works correctly in both Capacitor (Android/iOS) and
 * web/dev mode. localStorage is NOT used — it is sandboxed in
 * Capacitor's WebView and data written to it is inaccessible across
 * app restarts on some Android versions, and completely unreachable
 * by native code.
 */

import { Preferences } from '@capacitor/preferences';

const PREFIX = 'cmdrsys_';

export const storage = {
  async get(key) {
    try {
      const { value } = await Preferences.get({ key: PREFIX + key });
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },

  async set(key, value) {
    try {
      await Preferences.set({ key: PREFIX + key, value: JSON.stringify(value) });
      return true;
    } catch {
      return false;
    }
  },

  async remove(key) {
    try {
      await Preferences.remove({ key: PREFIX + key });
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

export async function getBodyNotes() {
  return (await storage.get('body_notes')) || [];
}
export async function saveBodyNotes(notes) {
  return storage.set('body_notes', notes);
}

export async function getDeletedItems() {
  return (await storage.get('deleted_items')) || [];
}
export async function saveDeletedItems(items) {
  return storage.set('deleted_items', items);
}

export async function getFolders() {
  return (await storage.get('folders')) || [];
}
export async function saveFolders(folders) {
  return storage.set('folders', folders);
}
