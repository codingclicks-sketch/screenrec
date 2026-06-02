import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import API from '../api';
import styles from './Account.module.css';

export default function Account() {
  const { user, authFetch, updateUser, logout } = useAuth();

  const [name, setName]   = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileMsg, setProfileMsg] = useState(null);   // {type, text}
  const [savingProfile, setSavingProfile] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState(null);
  const [savingPw, setSavingPw] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileMsg(null); setSavingProfile(true);
    try {
      const res = await authFetch(`${API}/api/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) { setProfileMsg({ type: 'err', text: data.error }); return; }
      updateUser(data);
      setProfileMsg({ type: 'ok', text: 'Profile updated.' });
    } catch {
      setProfileMsg({ type: 'err', text: 'Network error.' });
    } finally { setSavingProfile(false); }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwMsg(null); setSavingPw(true);
    try {
      const res = await authFetch(`${API}/api/auth/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) { setPwMsg({ type: 'err', text: data.error }); return; }
      setPwMsg({ type: 'ok', text: 'Password changed.' });
      setCurPw(''); setNewPw('');
    } catch {
      setPwMsg({ type: 'err', text: 'Network error.' });
    } finally { setSavingPw(false); }
  }

  const plan = user?.plan || 'free';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}><span className={styles.dot} />ScreenRec</Link>
        <div className={styles.headerRight}>
          <Link to="/" className="btn-ghost" style={{ fontSize: 13 }}>← Dashboard</Link>
          <button className="btn-ghost" onClick={logout} style={{ fontSize: 13 }}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Account settings</h1>

        {/* Plan card */}
        <section className={styles.card}>
          <div className={styles.planRow}>
            <div>
              <h2 className={styles.cardTitle}>Your plan</h2>
              <p className={styles.planName}>
                {plan === 'pro' ? '⭐ Pro' : 'Free'}
              </p>
            </div>
            {plan !== 'pro' && (
              <Link to="/pricing" className={styles.upgradeBtn}>Upgrade to Pro</Link>
            )}
          </div>
        </section>

        {/* Profile */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Profile</h2>
          {profileMsg && (
            <div className={profileMsg.type === 'ok' ? styles.ok : styles.err}>{profileMsg.text}</div>
          )}
          <form onSubmit={saveProfile}>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} />
            <label className={styles.label}>Email</label>
            <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <button className={styles.saveBtn} disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </section>

        {/* Password */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Change password</h2>
          {pwMsg && (
            <div className={pwMsg.type === 'ok' ? styles.ok : styles.err}>{pwMsg.text}</div>
          )}
          <form onSubmit={savePassword}>
            <label className={styles.label}>Current password</label>
            <input className={styles.input} type="password" value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" />
            <label className={styles.label}>New password</label>
            <input className={styles.input} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" placeholder="Min 6 characters" />
            <button className={styles.saveBtn} disabled={savingPw}>
              {savingPw ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
