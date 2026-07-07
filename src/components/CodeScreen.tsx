import { useState } from 'react';
import './CodeScreen.css';

interface Props {
  onReady: (code: string, name: string) => void;
}

type Mode = 'home' | 'join' | 'name';

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function CodeScreen({ onReady }: Props) {
  const [mode, setMode] = useState<Mode>('home');
  const [inputCode, setInputCode] = useState('');
  const [name, setName] = useState('');
  const [pendingCode, setPendingCode] = useState('');
  const [error, setError] = useState('');

  function handleCreate() {
    setPendingCode(generateCode());
    setMode('name');
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = inputCode.trim().toUpperCase();
    if (code.length < 4) { setError('Please enter a valid code'); return; }
    setPendingCode(code);
    setMode('name');
  }

  function handleName(e: React.FormEvent) {
    e.preventDefault();
    onReady(pendingCode, name.trim());
  }

  if (mode === 'name') {
    return (
      <div className="code-screen">
        <div className="code-screen-card">
          <div className="code-display-box">
            <div className="code-display-value">{pendingCode}</div>
            <div className="code-display-label">Your list code — share it to sync across devices</div>
          </div>
          <form onSubmit={handleName} className="code-form" style={{ marginTop: 20 }}>
            <input
              type="text"
              className="code-input"
              placeholder="Your name (e.g. Sean's iPhone)"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="code-btn-primary">
              {name.trim() ? 'Get started' : 'Skip'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="code-screen">
        <div className="code-screen-card">
          <button className="code-back" onClick={() => { setMode('home'); setError(''); }}>← Back</button>
          <h2 className="code-screen-heading">Enter your code</h2>
          <p className="code-screen-hint">Get the code from someone already using the list</p>
          <form onSubmit={handleJoin} className="code-form">
            <input
              type="text"
              className="code-input code-input-mono"
              placeholder="ABC123"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoFocus
              autoCapitalize="characters"
            />
            {error && <p className="code-error">{error}</p>}
            <button type="submit" className="code-btn-primary">Join</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="code-screen">
      <div className="code-screen-card">
        <img src="/task/favicon.svg" className="code-screen-logo" alt="" />
        <h1 className="code-screen-title">Task</h1>
        <p className="code-screen-sub">To-do list with voice capture</p>
        <div className="code-screen-actions">
          <button className="code-btn-primary" onClick={handleCreate}>Create new list</button>
          <button className="code-btn-secondary" onClick={() => setMode('join')}>Join existing list</button>
        </div>
      </div>
    </div>
  );
}
