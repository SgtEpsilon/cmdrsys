import React from 'react';

const NAV_ITEMS = [
  { id: 'dashboard', icon: '◈', label: 'Dashboard' },
  { id: 'logs',      icon: '◉', label: 'Log' },
  { id: 'bookmarks', icon: '◎', label: 'Bookmarks' },
  { id: 'visited',   icon: '◇', label: 'Visited' },
  { id: 'settings',  icon: '⚙', label: 'Settings' },
];

export default function BottomNav({ activeView, onNavigate, logCount, bmCount }) {
  const badges = { logs: logCount, bookmarks: bmCount };

  return (
    <nav style={{
      display: 'flex',
      background: 'linear-gradient(0deg, #03080f 0%, var(--bg-panel) 100%)',
      borderTop: '1px solid var(--border-o)',
      zIndex: 50,
      paddingBottom: 'var(--safe-bottom)',
      boxShadow: '0 -2px 20px rgba(255,98,0,0.12)',
    }}>
      {NAV_ITEMS.map(item => {
        const active = activeView === item.id;
        const badge  = badges[item.id];
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--ed-orange)' : 'var(--text-dim)',
              transition: 'color 0.15s',
              position: 'relative',
              borderTop: active ? '2px solid var(--ed-orange)' : '2px solid transparent',
            }}
          >
            <span style={{
              fontSize: '18px',
              textShadow: active ? '0 0 10px rgba(255,98,0,0.6)' : 'none',
              marginBottom: '2px',
            }}>{item.icon}</span>
            <span style={{
              fontFamily: 'var(--font-hud)',
              fontSize: '8px',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}>{item.label}</span>
            {badge > 0 && (
              <span style={{
                position: 'absolute', top: '6px', right: 'calc(50% - 14px)',
                background: 'var(--ed-orange)', color: '#000',
                fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 'bold',
                padding: '1px 4px', borderRadius: '2px', minWidth: '16px', textAlign: 'center',
              }}>{badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
