import React from 'react';
import { Panel, StatCard, Empty } from './UI.jsx';
import { edDate, edDateShort } from '../utils/edDate.js';

export default function Dashboard({ logs, bookmarks, visited, settings }) {
  const recentLogs = [...logs].sort((a, b) => b.ts - a.ts).slice(0, 6);
  const recentVisited = [...visited].slice(0, 6);

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '16px', color: 'var(--ed-orange)', letterSpacing: '4px', textTransform: 'uppercase', textShadow: '0 0 14px rgba(255,98,0,0.4)' }}>
          System Overview
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginTop: '3px' }}>
          All Systems Nominal — Local Storage Active
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <StatCard num={logs.length}      label="Log Entries" />
        <StatCard num={bookmarks.length} label="Bookmarks" />
        <StatCard num={visited.length}   label="Sys Visited" />
      </div>

      {/* Recent logs */}
      <Panel title="Recent Log Entries">
        {recentLogs.length === 0
          ? <Empty icon="◉" text="No entries yet" />
          : recentLogs.map(e => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 0', borderBottom: '1px solid rgba(0,212,255,0.07)',
              fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)',
            }}>
              <span style={{ color: 'var(--ed-orange)' }}>◉</span>
              <span style={{ color: 'var(--ed-cyan)' }}>{e.system || '?'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                {e.title}
              </span>
            </div>
          ))
        }
      </Panel>

      {/* Recent systems */}
      <Panel title="Recent Systems">
        {recentVisited.length === 0
          ? <Empty icon="◇" text="No systems tracked" />
          : recentVisited.map(s => (
            <div key={s.name + s.ts} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 0', borderBottom: '1px solid rgba(0,212,255,0.07)',
              fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)',
            }}>
              <span style={{ color: 'var(--ed-cyan)' }}>◇</span>
              <span style={{ color: 'var(--ed-cyan)', flex: 1 }}>{s.name}</span>
              <span style={{ fontSize: '10px' }}>{edDateShort(s.ts)}</span>
            </div>
          ))
        }
      </Panel>

      {/* System status */}
      <Panel title="System Status">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 2.2 }}>
          <div>CORE SYSTEMS: <span style={{ color: '#00FF88' }}>NOMINAL</span></div>
          <div>DATABASE: <span style={{ color: '#00FF88' }}>LOCAL STORAGE</span></div>
          <div>PLATFORM: <span style={{ color: 'var(--ed-cyan)' }}>ANDROID / CAPACITOR</span></div>
          <div>CMDRSYS: <span style={{ color: 'var(--ed-cyan)' }}>v2.0.0</span></div>
        </div>
      </Panel>
    </div>
  );
}
