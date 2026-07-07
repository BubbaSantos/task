import { useState } from 'react';
import { supabase } from '../lib/supabase';
import styles from './AuthScreen.module.css';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange in App.tsx handles the redirect
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <span className="msym" style={{ fontSize: 36, color: 'var(--accent)' }}>task_alt</span>
        </div>
        <h1 className={styles.appName}>Task</h1>
        <p className={styles.tagline}>Sign in to sync across all your devices</p>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${mode === 'signin' ? styles.activeTab : ''}`}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
          <button
            className={`${styles.tab} ${mode === 'signup' ? styles.activeTab : ''}`}
            onClick={() => switchMode('signup')}
          >
            Create account
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <input
            className={styles.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className={styles.input}
            type="password"
            placeholder="Password (min. 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />

          {error && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.success}>{success}</p>}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
