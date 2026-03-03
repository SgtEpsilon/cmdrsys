import React from 'react';

// ── Button ───────────────────────────────────────────────────────
const variantMap = {
  orange: { border: 'var(--ed-orange)', color: 'var(--ed-orange)', hoverBg: 'rgba(255,98,0,0.12)' },
  cyan:   { border: 'var(--ed-cyan)',   color: 'var(--ed-cyan)',   hoverBg: 'rgba(0,212,255,0.10)' },
  red:    { border: '#FF4040',          color: '#FF4040',          hoverBg: 'rgba(255,64,64,0.10)' },
  green:  { border: '#00FF88',          color: '#00FF88',          hoverBg: 'rgba(0,255,136,0.10)' },
};

export function Btn({ children, onClick, variant = 'orange', small, style, disabled }) {
  const v = variantMap[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'var(--font-hud)',
        fontSize: small ? '10px' : '11px',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        padding: small ? '7px 12px' : '9px 16px',
        border: `1px solid ${v.border}`,
        background: 'transparent',
        color: v.color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        WebkitTapHighlightColor: 'transparent',
        minHeight: '40px',
        ...style,
      }}
      onTouchStart={e => { e.currentTarget.style.background = v.hoverBg; }}
      onTouchEnd={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ── Panel ────────────────────────────────────────────────────────
export function Panel({ title, children, style }) {
  return (
    <div style={{
      background: 'rgba(5,14,24,0.88)',
      border: '1px solid var(--border-o)',
      padding: '16px',
      marginBottom: '14px',
      position: 'relative',
      clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)',
      ...style,
    }}>
      {/* corner accent */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 12, height: 12,
        background: 'var(--ed-orange)',
        clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
      }} />
      {title && (
        <div style={{
          fontFamily: 'var(--font-hud)', fontSize: '11px', color: 'var(--ed-orange)',
          letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px',
          paddingBottom: '8px', borderBottom: '1px solid var(--border-o)',
        }}>{title}</div>
      )}
      {children}
    </div>
  );
}

// ── FormInput ────────────────────────────────────────────────────
export function FormInput({ label, value, onChange, placeholder, type = 'text', style }) {
  return (
    <div style={{ marginBottom: '12px', ...style }}>
      {label && (
        <label style={{
          display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10px',
          color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase',
          marginBottom: '4px',
        }}>{label}</label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%', background: 'rgba(0,0,0,0.45)',
          border: '1px solid var(--border-c)', color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)', fontSize: '15px',
          padding: '10px 12px', outline: 'none',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
        onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
      />
    </div>
  );
}

// ── FormTextarea ─────────────────────────────────────────────────
export function FormTextarea({ label, value, onChange, placeholder, rows = 4 }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      {label && (
        <label style={{
          display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10px',
          color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase',
          marginBottom: '4px',
        }}>{label}</label>
      )}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%', background: 'rgba(0,0,0,0.45)',
          border: '1px solid var(--border-c)', color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)', fontSize: '15px',
          padding: '10px 12px', outline: 'none', resize: 'vertical',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
        onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
      />
    </div>
  );
}

// ── FormSelect ───────────────────────────────────────────────────
export function FormSelect({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      {label && (
        <label style={{
          display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10px',
          color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase',
          marginBottom: '4px',
        }}>{label}</label>
      )}
      <select
        value={value}
        onChange={onChange}
        style={{
          width: '100%', background: '#050e18',
          border: '1px solid var(--border-c)', color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)', fontSize: '15px',
          padding: '10px 12px', outline: 'none',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── SearchBar ────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'SEARCH...'}
        style={{
          width: '100%', background: 'rgba(0,0,0,0.4)',
          border: '1px solid var(--border-c)', color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)', fontSize: '13px',
          padding: '10px 14px', outline: 'none',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--ed-cyan)'}
        onBlur={e  => e.target.style.borderColor = 'var(--border-c)'}
      />
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, cyan, children }) {
  if (!open) return null;
  const accentColor = cyan ? 'var(--ed-cyan)' : 'var(--ed-orange)';
  const borderColor = cyan ? 'var(--border-c)' : 'var(--border-o)';
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0',
      }}
    >
      <div style={{
        background: 'var(--bg-panel)',
        border: `1px solid ${accentColor}`,
        padding: '20px 18px 28px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)',
        boxShadow: `0 0 50px rgba(${cyan ? '0,212,255' : '255,98,0'},0.25)`,
        borderRadius: '0',
        // slide up from bottom — Android‑native feel
        animation: 'slideUp 0.22s ease-out',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(60px); opacity:0 } to { transform:translateY(0); opacity:1 } }`}</style>
        {/* corner accent */}
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 16, height: 16,
          background: accentColor,
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
        }} />
        <div style={{
          fontFamily: 'var(--font-hud)', fontSize: '14px', color: accentColor,
          letterSpacing: '3px', marginBottom: '18px', paddingBottom: '10px',
          borderBottom: `1px solid ${borderColor}`,
        }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ── Tag ──────────────────────────────────────────────────────────
export function Tag({ label }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '2px 7px',
      border: '1px solid var(--border-c)', color: 'var(--ed-cyan)', letterSpacing: '1px',
    }}>{label}</span>
  );
}

// ── Empty state ──────────────────────────────────────────────────
export function Empty({ icon, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ fontSize: '40px', opacity: 0.15, marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '2px' }}>{text}</div>
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────
export function StatCard({ num, label }) {
  return (
    <div style={{
      background: 'rgba(5,14,24,0.88)',
      border: '1px solid var(--border-c)',
      padding: '14px 10px',
      textAlign: 'center',
      position: 'relative',
      clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)',
      flex: 1,
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8,
        background: 'var(--ed-cyan)', clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
      <div style={{
        fontFamily: 'var(--font-hud)', fontSize: '32px', fontWeight: 700,
        color: 'var(--ed-orange)', textShadow: '0 0 18px rgba(255,98,0,0.7)', lineHeight: 1,
      }}>{num}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)',
        letterSpacing: '2px', marginTop: '5px',
      }}>{label}</div>
    </div>
  );
}
