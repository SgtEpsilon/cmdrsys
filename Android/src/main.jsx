import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';

// ── Error Boundary — shows a readable error instead of a black screen ─────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error('CMDRSYS crash:', err, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        padding: '32px 24px', fontFamily: 'monospace', color: '#FF4040',
        background: '#020609', height: '100vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: '18px', letterSpacing: '4px', color: '#FF6200', marginBottom: '16px' }}>
          CMDRSYS — SYSTEM FAULT
        </div>
        <div style={{ fontSize: '13px', color: '#00D4FF', marginBottom: '8px' }}>
          {this.state.error.toString()}
        </div>
        <pre style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'pre-wrap', marginBottom: '24px' }}>
          {this.state.error.stack}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            fontFamily: 'monospace', background: 'transparent', border: '1px solid #FF6200',
            color: '#FF6200', padding: '10px 20px', cursor: 'pointer', letterSpacing: '2px',
          }}
        >
          REBOOT APP
        </button>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
