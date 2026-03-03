import React, { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const toast = useCallback((msg) => {
    setMessage(msg);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2800);
  }, []);

  return { message, visible, toast };
}

export function Toast({ message, visible }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(70px + var(--safe-bottom))',
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? '0' : '20px'})`,
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      padding: '9px 18px',
      border: '1px solid var(--ed-orange)',
      background: 'var(--bg-panel)',
      color: 'var(--ed-orange)',
      zIndex: 9999,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s, transform 0.3s',
      pointerEvents: 'none',
      letterSpacing: '1px',
      whiteSpace: 'nowrap',
      maxWidth: '90vw',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxShadow: '0 0 20px rgba(255,98,0,0.25)',
    }}>
      {message}
    </div>
  );
}
