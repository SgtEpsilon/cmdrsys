import { useState, useEffect, useCallback } from 'react';
import {
  getLogs, saveLogs,
  getBookmarks, saveBookmarks,
  getVisited, saveVisited,
  getSettings, saveSettings,
} from '../utils/storage.js';

export function useStore() {
  const [logs,      setLogsState]     = useState([]);
  const [bookmarks, setBookmarksState] = useState([]);
  const [visited,   setVisitedState]   = useState([]);
  const [settings,  setSettingsState]  = useState({ cmdr: 'UNKNOWN', ship: 'UNKNOWN VESSEL', system: 'SOL' });
  const [ready,     setReady]          = useState(false);

  // Load all data on mount
  useEffect(() => {
    (async () => {
      const [l, b, v, s] = await Promise.all([getLogs(), getBookmarks(), getVisited(), getSettings()]);
      setLogsState(l);
      setBookmarksState(b);
      setVisitedState(v);
      setSettingsState({ cmdr: 'UNKNOWN', ship: 'UNKNOWN VESSEL', system: 'SOL', ...s });
      setReady(true);
    })();
  }, []);

  // ── Logs ────────────────────────────────────────────────────────
  const upsertLog = useCallback(async (entry) => {
    setLogsState(prev => {
      const idx = prev.findIndex(l => l.id === entry.id);
      const next = idx >= 0
        ? prev.map(l => l.id === entry.id ? entry : l)
        : [entry, ...prev];
      saveLogs(next);
      return next;
    });
  }, []);

  const deleteLog = useCallback(async (id) => {
    setLogsState(prev => {
      const next = prev.filter(l => l.id !== id);
      saveLogs(next);
      return next;
    });
  }, []);

  // ── Bookmarks ───────────────────────────────────────────────────
  const upsertBookmark = useCallback(async (bm) => {
    setBookmarksState(prev => {
      const idx = prev.findIndex(b => b.id === bm.id);
      const next = idx >= 0
        ? prev.map(b => b.id === bm.id ? bm : b)
        : [bm, ...prev];
      saveBookmarks(next);
      return next;
    });
  }, []);

  const deleteBookmark = useCallback(async (id) => {
    setBookmarksState(prev => {
      const next = prev.filter(b => b.id !== id);
      saveBookmarks(next);
      return next;
    });
  }, []);

  // ── Visited ─────────────────────────────────────────────────────
  const clearVisited = useCallback(async () => {
    setVisitedState([]);
    saveVisited([]);
  }, []);

  // ── Settings ────────────────────────────────────────────────────
  const updateSettings = useCallback(async (patch) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── Import / Export ─────────────────────────────────────────────
  const exportData = useCallback(() => {
    const payload = JSON.stringify({ logs, bookmarks, visited, settings }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cmdrsys-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }, [logs, bookmarks, visited, settings]);

  const importData = useCallback(async (jsonText) => {
    try {
      const data = JSON.parse(jsonText);
      if (data.logs)      { await saveLogs(data.logs);           setLogsState(data.logs); }
      if (data.bookmarks) { await saveBookmarks(data.bookmarks); setBookmarksState(data.bookmarks); }
      if (data.visited)   { await saveVisited(data.visited);     setVisitedState(data.visited); }
      if (data.settings)  { await saveSettings(data.settings);   setSettingsState(s => ({ ...s, ...data.settings })); }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  return {
    ready,
    logs, upsertLog, deleteLog,
    bookmarks, upsertBookmark, deleteBookmark,
    visited, clearVisited,
    settings, updateSettings,
    exportData, importData,
  };
}
