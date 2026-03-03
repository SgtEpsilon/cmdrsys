import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLogs, saveLogs,
  getBookmarks, saveBookmarks,
  getVisited, saveVisited,
  getSettings, saveSettings,
} from '../utils/storage.js';
import { getSyncConfig, fullSync } from '../utils/syncService.js';

const AUTO_SYNC_INTERVAL = 30_000; // 30 seconds

export function useStore() {
  const [logs,      setLogsState]     = useState([]);
  const [bookmarks, setBookmarksState] = useState([]);
  const [visited,   setVisitedState]   = useState([]);
  const [settings,  setSettingsState]  = useState({ cmdr: 'UNKNOWN', ship: 'UNKNOWN VESSEL', system: 'SOL' });
  const [ready,     setReady]          = useState(false);

  // Sync state
  const [syncStatus,    setSyncStatus]    = useState('idle'); // 'idle' | 'syncing' | 'ok' | 'error'
  const [syncError,     setSyncError]     = useState('');
  const [lastSyncTime,  setLastSyncTime]  = useState(null);

  // Refs to avoid stale closures inside the interval
  const bookmarksRef = useRef([]);
  const logsRef      = useRef([]);
  bookmarksRef.current = bookmarks;
  logsRef.current      = logs;

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

  // ── Auto-sync timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;

    async function runSync() {
      const { url } = getSyncConfig();
      if (!url) return; // no sync URL — skip silently

      setSyncStatus('syncing');
      setSyncError('');
      try {
        const result = await fullSync(bookmarksRef.current, logsRef.current);

        // Persist and update state
        await saveBookmarks(result.bookmarks);
        setBookmarksState(result.bookmarks);

        await saveLogs(result.logs);
        setLogsState(result.logs);

        // Optionally pull CMDR/ship/system from desktop if still unknown
        const ds = result.settingsFromDesktop;
        if (ds) {
          setSettingsState(prev => {
            const next = { ...prev };
            if (ds.cmdr   && prev.cmdr   === 'UNKNOWN')        next.cmdr   = ds.cmdr;
            if (ds.ship   && prev.ship   === 'UNKNOWN VESSEL') next.ship   = ds.ship;
            if (ds.system && prev.system === 'SOL')            next.system = ds.system;
            saveSettings(next);
            return next;
          });
        }

        setSyncStatus('ok');
        setLastSyncTime(Date.now());
      } catch (e) {
        setSyncStatus('error');
        setSyncError(e.message);
        // Don't throw — silent fail on background sync
      }
    }

    // Run once immediately after data loads, then on interval
    runSync();
    const id = setInterval(runSync, AUTO_SYNC_INTERVAL);
    return () => clearInterval(id);
  }, [ready]); // only re-run if ready changes

  // ── Manual sync trigger ──────────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    const { url } = getSyncConfig();
    if (!url) throw new Error('No sync URL configured. Add it in Settings › Sync.');

    setSyncStatus('syncing');
    setSyncError('');
    try {
      const result = await fullSync(bookmarksRef.current, logsRef.current);

      await saveBookmarks(result.bookmarks);
      setBookmarksState(result.bookmarks);

      await saveLogs(result.logs);
      setLogsState(result.logs);

      const ds = result.settingsFromDesktop;
      if (ds) {
        setSettingsState(prev => {
          const next = { ...prev };
          if (ds.cmdr)   next.cmdr   = ds.cmdr;
          if (ds.ship)   next.ship   = ds.ship;
          if (ds.system) next.system = ds.system;
          saveSettings(next);
          return next;
        });
      }

      setSyncStatus('ok');
      setLastSyncTime(Date.now());
      return { ok: true, bookmarks: result.bookmarks.length, logs: result.logs.length };
    } catch (e) {
      setSyncStatus('error');
      setSyncError(e.message);
      throw e;
    }
  }, []);

  // ── Logs ────────────────────────────────────────────────────────────────────
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

  // ── Bookmarks ────────────────────────────────────────────────────────────────
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

  // ── Visited ──────────────────────────────────────────────────────────────────
  const clearVisited = useCallback(async () => {
    setVisitedState([]);
    saveVisited([]);
  }, []);

  // ── Settings ─────────────────────────────────────────────────────────────────
  const updateSettings = useCallback(async (patch) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── Import / Export ──────────────────────────────────────────────────────────
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
    // Sync
    syncStatus, syncError, lastSyncTime, triggerSync,
  };
}
