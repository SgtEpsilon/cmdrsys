import React, { useState, useRef, useEffect } from 'react';
import { Btn, Panel, FormInput } from './UI.jsx';
import { getSyncConfig, setSyncConfig, pingDesktop } from '../utils/syncService.js';

// ── Folder Manager ────────────────────────────────────────────────────────────
function FolderManager({ folders, upsertFolder, deleteFolder }) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    upsertFolder({ id: String(Date.now()), name });
    setNewName('');
  }

  function startEdit(f) {
    setEditingId(f.id);
    setEditName(f.name);
  }

  function handleRename(id) {
    const name = editName.trim();
    if (!name) return;
    const folder = folders.find(f => f.id === id);
    if (folder) upsertFolder({ ...folder, name });
    setEditingId(null);
  }

  return (
    <Panel title="Folder Management">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.8, marginBottom: '12px' }}>
        Create folders to organise bookmarks and body notes by expedition or region.
      </div>
      {/* Add new folder */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="New folder name..."
          style={{ flex: 1, background: 'rgba(0,0,0,0.45)', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '14px', padding: '9px 12px', outline: 'none' }}
          onFocus={e => e.target.style.borderColor = 'var(--ed-orange)'}
          onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
        />
        <Btn onClick={handleAdd} variant="orange" small disabled={!newName.trim()}>+ Add</Btn>
      </div>

      {/* Folder list */}
      {folders.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>
          No folders yet
        </div>
      ) : folders.map(f => (
        <div key={f.id} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '9px 10px', marginBottom: '6px',
          border: '1px solid var(--border-c)',
          background: 'rgba(5,14,24,0.6)',
        }}>
          <span style={{ color: 'var(--ed-orange)', fontSize: '12px', marginRight: '2px' }}>▸</span>
          {editingId === f.id ? (
            <>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(f.id); if (e.key === 'Escape') setEditingId(null); }}
                autoFocus
                style={{ flex: 1, background: 'rgba(0,0,0,0.45)', border: '1px solid var(--ed-orange)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '13px', padding: '5px 8px', outline: 'none' }}
              />
              <Btn onClick={() => handleRename(f.id)} variant="orange" small>Save</Btn>
              <Btn onClick={() => setEditingId(null)} variant="red" small>X</Btn>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)' }}>{f.name}</span>
              <Btn onClick={() => startEdit(f)} variant="cyan" small>Rename</Btn>
              <Btn onClick={() => { if (window.confirm(`Delete folder "${f.name}"?`)) deleteFolder(f.id); }} variant="red" small>Del</Btn>
            </>
          )}
        </div>
      ))}
    </Panel>
  );
}


export default function SettingsView({
  settings, updateSettings,
  logs, bookmarks, visited,
  exportData, importData, onJournalImport,
  syncStatus, syncError, lastSyncTime, triggerSync,
  folders, upsertFolder, deleteFolder,
}) {
  const [cmdr, setCmdr] = useState(settings.cmdr || '');
  const [ship, setShip] = useState(settings.ship || '');
  const [msg,  setMsg]  = useState('');
  const fileRef = useRef(null);
  const jsonRef = useRef(null);

  // Sync config local state — loaded async on mount
  const [syncUrl,   setSyncUrl]   = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [pingState, setPingState] = useState('idle'); // 'idle' | 'pinging' | 'ok' | 'error'
  const [manualSyncing, setManualSyncing] = useState(false);

  // Load sync config from storage on mount (getSyncConfig is now async)
  useEffect(() => {
    getSyncConfig().then(({ url, token }) => {
      setSyncUrl(url || '');
      setSyncToken(token || '');
    }).catch(() => {});
  }, []);

  // Keep profile fields in sync if settings change externally
  useEffect(() => {
    setCmdr(settings.cmdr || '');
    setShip(settings.ship || '');
  }, [settings.cmdr, settings.ship]);

  function notify(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  }

  async function saveProfile() {
    await updateSettings({ cmdr: cmdr.toUpperCase(), ship: ship.toUpperCase() });
    notify('◈ Profile saved');
  }

  async function handleExport() {
    try {
      await exportData();
    } catch (e) {
      notify('⚠ ' + e.message);
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = await importData(text);
    notify(res.ok ? '⬆ Data imported successfully' : '⚠ Import failed: ' + res.error);
    e.target.value = '';
  }

  async function handleJournalImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const systems = [];
    let lastCmdr = null, lastShip = null;

    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (['FSDJump','CarrierJump','Location'].includes(ev.event) && ev.StarSystem) {
          systems.push({ name: ev.StarSystem, ts: new Date(ev.timestamp).getTime() || Date.now() });
        }
        if (ev.event === 'Commander' && ev.Name) lastCmdr = ev.Name;
        if (ev.event === 'Loadout' && ev.Ship_Localised) lastShip = ev.Ship_Localised;
        if (ev.event === 'LoadGame') {
          if (ev.Commander) lastCmdr = ev.Commander;
          if (ev.Ship_Localised) lastShip = ev.Ship_Localised;
        }
      } catch {}
    }

    const seen = new Map();
    for (const s of systems) {
      if (!seen.has(s.name) || seen.get(s.name).ts < s.ts) seen.set(s.name, s);
    }
    const deduped = [...seen.values()].sort((a, b) => b.ts - a.ts);

    if (onJournalImport) onJournalImport(deduped, lastCmdr, lastShip);
    notify(`▸ Imported ${deduped.length} systems${lastCmdr ? ` · CMDR ${lastCmdr}` : ''}`);
    e.target.value = '';
  }

  // ── Sync handlers ────────────────────────────────────────────────────────────

  function saveSyncConfig() {
    setSyncConfig({ url: syncUrl, token: syncToken });
    notify('◈ Sync settings saved');
  }

  async function handlePing() {
    setSyncConfig({ url: syncUrl, token: syncToken });
    setPingState('pinging');
    try {
      await pingDesktop();
      setPingState('ok');
      notify('◈ Desktop reachable — connection good');
    } catch (e) {
      setPingState('error');
      notify('⚠ Cannot reach desktop: ' + e.message);
    }
    setTimeout(() => setPingState('idle'), 4000);
  }

  async function handleManualSync() {
    setSyncConfig({ url: syncUrl, token: syncToken });
    setManualSyncing(true);
    try {
      const result = await triggerSync();
      notify(`↔ Synced — ${result.bookmarks} bookmarks · ${result.logs} logs`);
    } catch (e) {
      notify('⚠ Sync failed: ' + e.message);
    } finally {
      setManualSyncing(false);
    }
  }

  // ── Status helpers ───────────────────────────────────────────────────────────

  const statusColor = {
    idle:    'var(--text-dim)',
    syncing: 'var(--ed-orange)',
    ok:      '#00FF88',
    error:   '#FF4040',
  };
  const statusText = {
    idle:    syncUrl ? 'Idle — will sync every 30 s' : 'Configure URL below to enable auto-sync',
    syncing: 'Syncing…',
    ok:      lastSyncTime ? `Last sync: ${new Date(lastSyncTime).toLocaleTimeString()}` : 'Synced',
    error:   `Error: ${syncError}`,
  };

  const pingColor  = { idle: 'var(--ed-cyan)', pinging: 'var(--ed-orange)', ok: '#00FF88', error: '#FF4040' };
  const pingLabel  = { idle: 'Test Connection', pinging: 'Testing…', ok: '✓ Connected', error: '✗ Failed' };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '16px', color: 'var(--ed-orange)', letterSpacing: '4px' }}>Settings & Data</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginTop: '3px' }}>Configuration, export and import</div>
      </div>

      {msg && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '10px 14px',
          border: '1px solid var(--ed-orange)', background: 'var(--bg-panel)',
          color: 'var(--ed-orange)', marginBottom: '14px', letterSpacing: '1px',
        }}>{msg}</div>
      )}

      {/* ── Commander Profile ──────────────────────────────────────────── */}
      <Panel title="Commander Profile">
        <FormInput label="Commander Name"   value={cmdr} onChange={e => setCmdr(e.target.value)} placeholder="CMDR NAME" />
        <FormInput label="Ship Name / Type" value={ship} onChange={e => setShip(e.target.value)} placeholder="VESSEL NAME" />
        <Btn onClick={saveProfile} small>Save Profile</Btn>
      </Panel>

      {/* ── Auto-Sync ─────────────────────────────────────────────────── */}
      <Panel title="Desktop Auto-Sync">

        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor[syncStatus] || 'var(--text-dim)',
            boxShadow: syncStatus === 'ok' ? '0 0 6px rgba(0,255,136,0.7)' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: statusColor[syncStatus] }}>
            {statusText[syncStatus]}
          </span>
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.9, marginBottom: '12px' }}>
          <div>Enter the address shown in the Electron app's Settings › Mobile Sync panel.</div>
          <div>Both devices must be on the same WiFi network.</div>
          <div style={{ marginTop: '4px', color: 'var(--ed-cyan)' }}>Syncs: bookmarks · logs</div>
        </div>

        <FormInput
          label="Desktop Sync URL"
          value={syncUrl}
          onChange={e => setSyncUrl(e.target.value)}
          placeholder="http://192.168.1.x:45678"
        />

        <FormInput
          label="Security Token (optional)"
          value={syncToken}
          onChange={e => setSyncToken(e.target.value)}
          placeholder="Leave empty if not set on desktop"
        />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          <Btn onClick={saveSyncConfig} small>Save Settings</Btn>
          <Btn
            onClick={handlePing}
            variant="cyan"
            small
            disabled={!syncUrl || pingState === 'pinging'}
            style={{ color: pingColor[pingState], borderColor: pingColor[pingState] }}
          >
            {pingLabel[pingState]}
          </Btn>
          <Btn
            onClick={handleManualSync}
            variant="green"
            small
            disabled={!syncUrl || manualSyncing || syncStatus === 'syncing'}
          >
            {manualSyncing ? 'Syncing…' : '↔ Sync Now'}
          </Btn>
        </div>
      </Panel>

      {/* ── Journal Import ────────────────────────────────────────────── */}
      <Panel title="Import Journal File">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.9, marginBottom: '12px' }}>
          <div>Copy your latest <span style={{ color: 'var(--ed-orange)' }}>Journal.*.log</span> from your PC to your phone,</div>
          <div>then tap the button below to import FSD jumps and auto-detect your CMDR &amp; ship.</div>
          <div style={{ marginTop: '4px' }}>PC path: <span style={{ color: 'var(--ed-cyan)' }}>%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous\</span></div>
        </div>
        <input
          ref={jsonRef}
          type="file"
          accept=".log,.json,text/plain"
          style={{ display: 'none' }}
          onChange={handleJournalImport}
        />
        <Btn onClick={() => jsonRef.current?.click()} variant="green" small>▶ Import Journal .log File</Btn>
      </Panel>

      {/* ── Backup & Restore ──────────────────────────────────────────── */}
      <Panel title="Backup & Restore">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.9, marginBottom: '12px' }}>
          Export a full JSON backup of all your logs, bookmarks and visited systems. Import to restore on any device.
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Btn onClick={handleExport} variant="green" small>⬇ Export JSON</Btn>
          <Btn onClick={() => fileRef.current?.click()} variant="cyan" small>⬆ Import JSON</Btn>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
      </Panel>

      {/* ── Folder Management ─────────────────────────────────────────── */}
      <FolderManager folders={folders || []} upsertFolder={upsertFolder} deleteFolder={deleteFolder} />

      {/* ── DB Info ───────────────────────────────────────────────────── */}
      <Panel title="Database Info">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 2.2 }}>
          <div>ENGINE: <span style={{ color: 'var(--ed-cyan)' }}>LOCAL STORAGE (CAPACITOR PREFERENCES)</span></div>
          <div>LOGS: <span style={{ color: 'var(--ed-cyan)' }}>{logs.length}</span> records</div>
          <div>BOOKMARKS: <span style={{ color: 'var(--ed-cyan)' }}>{bookmarks.length}</span> records</div>
          <div>VISITED SYSTEMS: <span style={{ color: 'var(--ed-cyan)' }}>{visited.length}</span> records</div>
        </div>
      </Panel>
    </div>
  );
}
