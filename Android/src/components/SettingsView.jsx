import React, { useState, useRef } from 'react';
import { Btn, Panel, FormInput } from './UI.jsx';

export default function SettingsView({ settings, updateSettings, logs, bookmarks, visited, exportData, importData, onJournalImport }) {
  const [cmdr, setCmdr] = useState(settings.cmdr || '');
  const [ship, setShip] = useState(settings.ship || '');
  const [msg,  setMsg]  = useState('');
  const fileRef = useRef(null);
  const jsonRef = useRef(null);

  // Keep local state in sync if settings change externally
  React.useEffect(() => {
    setCmdr(settings.cmdr || '');
    setShip(settings.ship || '');
  }, [settings.cmdr, settings.ship]);

  function notify(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  async function saveProfile() {
    await updateSettings({ cmdr: cmdr.toUpperCase(), ship: ship.toUpperCase() });
    notify('◈ Profile saved');
  }

  function handleExport() {
    exportData();
    notify('⬇ Export started');
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = await importData(text);
    notify(res.ok ? '⬆ Data imported successfully' : '⚠ Import failed: ' + res.error);
    e.target.value = '';
  }

  // Journal import — parse FSD jumps out of an ED .log file
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

    // Deduplicate by system name, keep latest
    const seen = new Map();
    for (const s of systems) {
      if (!seen.has(s.name) || seen.get(s.name).ts < s.ts) seen.set(s.name, s);
    }
    const deduped = [...seen.values()].sort((a, b) => b.ts - a.ts);

    if (onJournalImport) onJournalImport(deduped, lastCmdr, lastShip);
    notify(`▸ Imported ${deduped.length} systems${lastCmdr ? ` · CMDR ${lastCmdr}` : ''}`);
    e.target.value = '';
  }

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

      {/* Commander Profile */}
      <Panel title="Commander Profile">
        <FormInput label="Commander Name" value={cmdr} onChange={e => setCmdr(e.target.value)} placeholder="CMDR NAME" />
        <FormInput label="Ship Name / Type" value={ship} onChange={e => setShip(e.target.value)} placeholder="VESSEL NAME" />
        <Btn onClick={saveProfile} small>Save Profile</Btn>
      </Panel>

      {/* Journal Import */}
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

      {/* Backup & Restore */}
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

      {/* DB Info */}
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
