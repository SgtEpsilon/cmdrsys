import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLogs, saveLogs,
  getBookmarks, saveBookmarks,
  getVisited, saveVisited,
  getSettings, saveSettings,
  getBodyNotes, saveBodyNotes,
} from '../utils/storage.js';
import { getSyncConfig, fullSync, deleteBookmarkOnDesktop, deleteLogOnDesktop, deleteBodyNoteOnDesktop } from '../utils/syncService.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Normalise legacy x/y -> lat/lon for bookmarks loaded from local storage
function normaliseBm(b) {
  if (!b) return b;
  const out = { ...b };
  out.lat = b.lat ?? b.x ?? null;
  out.lon = b.lon ?? b.y ?? null;
  delete out.x;
  delete out.y;
  return out;
}

const AUTO_SYNC_INTERVAL = 30_000;

export function useStore() {
  const [logs,       setLogsState]      = useState([]);
  const [bookmarks,  setBookmarksState]  = useState([]);
  const [visited,    setVisitedState]    = useState([]);
  const [settings,   setSettingsState]   = useState({ cmdr: 'UNKNOWN', ship: 'UNKNOWN VESSEL', system: 'SOL' });
  const [bodyNotes,  setBodyNotesState]  = useState([]);
  const [ready,      setReady]           = useState(false);

  // Sync state
  const [syncStatus,    setSyncStatus]    = useState('idle'); // 'idle' | 'syncing' | 'ok' | 'error'
  const [syncError,     setSyncError]     = useState('');
  const [lastSyncTime,  setLastSyncTime]  = useState(null);

  // Refs to avoid stale closures inside the interval
  const bookmarksRef = useRef([]);
  const logsRef      = useRef([]);
  const bodyNotesRef = useRef([]);
  bookmarksRef.current = bookmarks;
  logsRef.current      = logs;
  bodyNotesRef.current = bodyNotes;

  // Load all data on mount
  useEffect(() => {
    (async () => {
      try {
        const [l, b, v, s, bn] = await Promise.all([getLogs(), getBookmarks(), getVisited(), getSettings(), getBodyNotes()]);
        setLogsState(l);
        setBookmarksState((b || []).map(normaliseBm));
        setVisitedState(v);
        setSettingsState({ cmdr: 'UNKNOWN', ship: 'UNKNOWN VESSEL', system: 'SOL', ...s });
        setBodyNotesState(bn || []);
      } catch (e) {
        console.error('useStore: load error', e);
      } finally {
        // Always mark ready — even on storage error, show empty app rather than black screen
        setReady(true);
      }
    })();
  }, []);

  // ── Auto-sync timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;

    async function runSync() {
      // Read config fresh each tick — user may have just saved it in Settings
      const { url } = await getSyncConfig();
      if (!url) return; // no URL configured — skip silently

      setSyncStatus('syncing');
      setSyncError('');
      try {
        const result = await fullSync(bookmarksRef.current, logsRef.current, bodyNotesRef.current);

        // Persist and update state
        await saveBookmarks(result.bookmarks);
        setBookmarksState(result.bookmarks.map(normaliseBm));

        await saveLogs(result.logs);
        setLogsState(result.logs);

        await saveBodyNotes(result.bodyNotes);
        setBodyNotesState(result.bodyNotes);

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

    // Delay first sync 3s so UI is settled, then repeat every 30s
    const firstRun = setTimeout(runSync, 3_000);
    const id = setInterval(runSync, AUTO_SYNC_INTERVAL);
    return () => { clearTimeout(firstRun); clearInterval(id); };
  }, [ready]); // only re-run if ready changes

  // ── Manual sync trigger ──────────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    const { url } = await getSyncConfig();
    if (!url) throw new Error('No sync URL configured. Add it in Settings › Desktop Sync.');

    setSyncStatus('syncing');
    setSyncError('');
    try {
      const result = await fullSync(bookmarksRef.current, logsRef.current, bodyNotesRef.current);

      await saveBookmarks(result.bookmarks);
      setBookmarksState(result.bookmarks.map(normaliseBm));

      await saveLogs(result.logs);
      setLogsState(result.logs);

      await saveBodyNotes(result.bodyNotes);
      setBodyNotesState(result.bodyNotes);

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
      return { ok: true, bookmarks: result.bookmarks.length, logs: result.logs.length, bodyNotes: result.bodyNotes.length };
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
    // Best-effort — propagate deletion to desktop if sync is configured
    deleteLogOnDesktop(id);
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
    // Best-effort — propagate deletion to desktop if sync is configured
    deleteBookmarkOnDesktop(id);
  }, []);

  // ── Body Notes ───────────────────────────────────────────────────────────────
  const upsertBodyNote = useCallback(async (note) => {
    setBodyNotesState(prev => {
      const idx = prev.findIndex(n => n.id === note.id);
      const next = idx >= 0
        ? prev.map(n => n.id === note.id ? note : n)
        : [note, ...prev];
      saveBodyNotes(next);
      return next;
    });
  }, []);

  const deleteBodyNote = useCallback(async (id) => {
    setBodyNotesState(prev => {
      const next = prev.filter(n => n.id !== id);
      saveBodyNotes(next);
      return next;
    });
    // Best-effort — propagate deletion to desktop if sync is configured
    deleteBodyNoteOnDesktop(id);
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
  const exportData = useCallback(async () => {
    const payload = JSON.stringify({ logs, bookmarks, visited, settings }, null, 2);
    const fileName = `cmdrsys-backup-${Date.now()}.json`;
    try {
      // Write to the app's cache directory (always writable, no permissions needed)
      const result = await Filesystem.writeFile({
        path: fileName,
        data: payload,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      // Open the system share sheet so the user can save/send the file
      await Share.share({
        title: 'CMDRSYS Backup',
        text:  'CMDRSYS data export',
        url:   result.uri,
        dialogTitle: 'Save or share CMDRSYS backup',
      });
      return true;
    } catch (e) {
      console.error('Export failed:', e);
      throw new Error('Export failed: ' + e.message);
    }
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
    bodyNotes, upsertBodyNote, deleteBodyNote,
    visited, clearVisited,
    settings, updateSettings,
    exportData, importData,
    // Sync
    syncStatus, syncError, lastSyncTime, triggerSync,
  };
}
