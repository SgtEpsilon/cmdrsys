import React, { useState, useMemo } from 'react';
import { Btn, SearchBar, Empty } from './UI.jsx';
import { edDate } from '../utils/edDate.js';

export default function VisitedView({ visited, clearVisited, onBookmark }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return visited.filter(v => v.name.toLowerCase().includes(q));
  }, [visited, query]);

  async function handleClear() {
    if (!window.confirm('Clear all visited systems? This cannot be undone.')) return;
    await clearVisited();
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '16px', color: 'var(--ed-orange)', letterSpacing: '4px' }}>Visited Systems</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px', marginTop: '3px' }}>Imported from journal data</div>
        </div>
        <Btn onClick={handleClear} variant="red" small>Clear All</Btn>
      </div>

      <SearchBar value={query} onChange={e => setQuery(e.target.value)} placeholder="SEARCH VISITED SYSTEMS..." />

      {filtered.length === 0
        ? <Empty icon="◇" text={visited.length === 0 ? 'No systems tracked yet. Import a journal to populate.' : 'No systems match.'} />
        : filtered.map(v => (
          <div key={v.name + v.ts} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 14px', marginBottom: '6px',
            border: '1px solid rgba(0,212,255,0.15)',
            background: 'rgba(5,14,24,0.8)',
            clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)',
          }}>
            <span style={{ color: 'var(--ed-cyan)', fontSize: '16px' }}>◇</span>
            <span style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', color: 'var(--ed-cyan)', flex: 1 }}>{v.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
              {edDate(v.ts)}
            </span>
            <Btn onClick={() => onBookmark(v.name)} variant="cyan" small>BM</Btn>
          </div>
        ))
      }
    </div>
  );
}
