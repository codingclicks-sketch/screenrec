import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api';
import styles from './Auth.module.css';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API}/api/auth/forgot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch { setSent(true); } finally { setLoading(false); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}><span className={styles.dot} />VeoRec</div>
        <h1 className={styles.title}>Reset password</h1>
        <p className={styles.sub}>We’ll email you a link to set a new password.</p>

        {sent ? (
          <>
            <div className={styles.ok || ''} style={{ background: '#e7f7ef', border: '1px solid #b6e6cf', color: '#14794e', borderRadius: 8, padding: '12px 14px', fontSize: 14 }}>
              If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox (and spam).
            </div>
            <p className={styles.footer}><Link to="/login">← Back to sign in</Link></p>
          </>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <label className={styles.label}>Email</label>
            <input type="email" required placeholder="you@example.com" className={styles.input}
              value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <p className={styles.footer}><Link to="/login">← Back to sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
