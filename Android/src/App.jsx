import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from './hooks/useStore.js';
import { edNow } from './utils/edDate.js';
import { saveVisited, getVisited } from './utils/storage.js';

import HologramPlanet  from './components/HologramPlanet.jsx';
import BottomNav       from './components/BottomNav.jsx';
import Dashboard       from './components/Dashboard.jsx';
import LogsView        from './components/LogsView.jsx';
import BookmarksView   from './components/BookmarksView.jsx';
import VisitedView     from './components/VisitedView.jsx';
import SettingsView    from './components/SettingsView.jsx';
import { Toast, useToast } from './components/Toast.jsx';

export default function App() {
  const store = useStore();
  const { message, visible, toast } = useToast();
  const [view,  setView]  = useState('dashboard');
  const [clock, setClock] = useState(edNow());
  const [pendingBookmark, setPendingBookmark] = useState(null);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setClock(edNow()), 1000);
    return () => clearInterval(id);
  }, []);

  // Navigate with toast hook passed down
  function navigate(v) { setView(v); }

  // Journal import handler
  const handleJournalImport = useCallback(async (systems, cmdr, ship) => {
    // Merge with existing visited, deduplicate
    const existing = store.visited || [];
    const existingNames = new Set(existing.map(v => v.name));
    const newSystems = systems.filter(s => !existingNames.has(s.name));
    const merged = [...newSystems, ...existing];
    await saveVisited(merged);

    // Force re-read (since useStore uses internal state)
    // We'll patch via updateSettings to trigger re-mount isn't ideal—
    // instead we expose a direct visited setter via store.
    // For now: reload page (Capacitor apps can do this cleanly)
    if (cmdr) await store.updateSettings({ cmdr: cmdr.toUpperCase() });
    if (ship) await store.updateSettings({ ship: ship.toUpperCase() });

    // Reload page to pick up visited changes
    window.location.reload();
  }, [store]);

  // Visited view → open bookmark modal on bookmarks tab
  function handleBookmarkFromVisited(sysName) {
    setPendingBookmark(sysName);
    setView('bookmarks');
  }

  if (!store.ready) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: '18px', position: 'relative', zIndex: 1,
      }}>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '14px', color: 'var(--ed-orange)', letterSpacing: '4px' }}>
          INITIALISING CMDRSYS
        </div>
        <div style={{ width: '240px', height: '3px', background: 'rgba(0,212,255,0.12)' }}>
          <div style={{ height: '3px', background: 'var(--ed-cyan)', animation: 'loadBar 1s ease-in-out infinite alternate', boxShadow: '0 0 10px rgba(0,212,255,0.6)' }} />
        </div>
        <style>{`@keyframes loadBar { from{width:20%} to{width:90%} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
      <div className="scan-line" />

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(180deg, #0c1e30 0%, var(--bg-panel) 100%)',
        borderBottom: '1px solid var(--border-o)',
        padding: '10px 14px',
        paddingTop: 'calc(10px + var(--safe-top))',
        zIndex: 20,
        boxShadow: '0 2px 24px rgba(255,98,0,0.15)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Hologram */}
          <div style={{ flexShrink: 0 }}>
            <HologramPlanet size={48} />
          </div>

          {/* Logo + CMDR info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-hud)', fontSize: '18px', fontWeight: 900, letterSpacing: '4px',
              color: 'var(--ed-orange)', textShadow: '0 0 12px var(--ed-orange)',
            }}>
              CMDR<span style={{ color: 'var(--ed-cyan)' }}>SYS</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                CMDR: <span style={{ color: 'var(--ed-cyan)' }}>{store.settings.cmdr || 'UNKNOWN'}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                SYS: <span style={{ color: 'var(--ed-cyan)' }}>{store.settings.system || 'SOL'}</span>
              </span>
            </div>
          </div>

          {/* Clock */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            color: 'var(--ed-orange)', letterSpacing: '1px',
            textShadow: '0 0 8px rgba(255,98,0,0.4)',
            textAlign: 'right', flexShrink: 0,
            whiteSpace: 'nowrap',
          }}>
            {clock}
          </div>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', position: 'relative' }}>
        {view === 'dashboard' && (
          <Dashboard
            logs={store.logs}
            bookmarks={store.bookmarks}
            visited={store.visited}
            settings={store.settings}
          />
        )}
        {view === 'logs' && (
          <LogsView
            logs={store.logs}
            upsertLog={async (e) => { await store.upsertLog(e); toast('◉ Log entry saved'); }}
            deleteLog={async (id) => { await store.deleteLog(id); toast('Entry deleted'); }}
            currentSystem={store.settings.system}
          />
        )}
        {view === 'bookmarks' && (
          <BookmarksView
            bookmarks={store.bookmarks}
            upsertBookmark={async (b) => { await store.upsertBookmark(b); toast('◎ Bookmark saved'); }}
            deleteBookmark={async (id) => { await store.deleteBookmark(id); toast('Bookmark deleted'); }}
            currentSystem={store.settings.system}
            initialPrefill={pendingBookmark}
            onPrefillConsumed={() => setPendingBookmark(null)}
          />
        )}
        {view === 'visited' && (
          <VisitedView
            visited={store.visited}
            clearVisited={async () => { await store.clearVisited(); toast('Visited systems cleared'); }}
            onBookmark={handleBookmarkFromVisited}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            settings={store.settings}
            updateSettings={store.updateSettings}
            logs={store.logs}
            bookmarks={store.bookmarks}
            visited={store.visited}
            exportData={store.exportData}
            importData={store.importData}
            onJournalImport={handleJournalImport}
          />
        )}
      </main>

      {/* ── Bottom Nav ───────────────────────────────────────────── */}
      <BottomNav
        activeView={view}
        onNavigate={navigate}
        logCount={store.logs.length}
        bmCount={store.bookmarks.length}
      />

      {/* ── Toast ────────────────────────────────────────────────── */}
      <Toast message={message} visible={visible} />
    </div>
  );
}
