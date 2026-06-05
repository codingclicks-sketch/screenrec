import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageSquare, Send, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import API from '../api';
import s from './Contact.module.css';

export default function Contact() {
  const { user, token } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '', email: user?.email || '', subject: '', message: '',
  });
  const [status, setStatus] = useState(''); // '' | 'sending' | 'sent' | 'error'
  const [error, setError] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setStatus('sending'); setError('');
    try {
      const res = await fetch(`${API}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not send your message'); setStatus('error'); return; }
      setStatus('sent');
    } catch { setError('Network error — please try again.'); setStatus('error'); }
  }

  return (
    <div className={s.page}>
      <header className={s.nav}>
        <Link to="/" className={s.brand}><img src="/logo.png" alt="" className={s.brandLogo} />VeoRec</Link>
        <Link to={user ? '/' : '/login'} className={s.back}>{user ? '← Dashboard' : 'Sign in'}</Link>
      </header>

      <main className={s.main}>
        <div className={s.intro}>
          <div className={s.iconBadge}><MessageSquare size={26} color="#6366f1" /></div>
          <h1 className={s.title}>Get in touch</h1>
          <p className={s.sub}>
            Questions, feedback, or need a hand? Send us a message and we’ll get back to you by email.
          </p>
          <a href="mailto:codingclicks@gmail.com" className={s.mailLink}><Mail size={16} /> codingclicks@gmail.com</a>
        </div>

        <div className={s.card}>
          {status === 'sent' ? (
            <div className={s.success}>
              <CheckCircle2 size={48} color="#16a34a" />
              <h2>Message sent!</h2>
              <p>Thanks, {form.name || 'there'}. We’ve received your message and will reply to <strong>{form.email}</strong> soon.</p>
              <Link to="/" className={s.primaryBtn}>Back to home</Link>
            </div>
          ) : (
            <form onSubmit={submit} className={s.form}>
              {error && <div className={s.error}>{error}</div>}
              <div className={s.row}>
                <div className={s.field}>
                  <label>Name</label>
                  <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your name" />
                </div>
                <div className={s.field}>
                  <label>Email</label>
                  <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
                </div>
              </div>
              <div className={s.field}>
                <label>Subject</label>
                <input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="What’s this about?" />
              </div>
              <div className={s.field}>
                <label>Message</label>
                <textarea required rows={6} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="How can we help?" />
              </div>
              <button type="submit" className={s.primaryBtn} disabled={status === 'sending'}>
                <Send size={16} /> {status === 'sending' ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
