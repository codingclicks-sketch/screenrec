import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

export default function Privacy() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}><span className={styles.dot} />ScreenRec</Link>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Last updated: June 2, 2026</p>

        <p>
          ScreenRec ("we", "our", or "the Service") provides a screen-recording tool and
          Chrome extension that lets you record your screen, camera and microphone and
          share the resulting videos via a link. This policy explains what we collect and
          how we use it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account information.</strong> When you sign up we store your name, email address, and a securely hashed password. Passwords are hashed with bcrypt and are never stored in plain text.</li>
          <li><strong>Recordings.</strong> Videos you record and choose to upload are stored on our media host (Cloudinary) and associated with your account.</li>
          <li><strong>Authentication tokens.</strong> A login token is stored locally in your browser (and in the Chrome extension's local storage) so you stay signed in. It is never shared with third parties.</li>
        </ul>

        <h2>How we use your information</h2>
        <ul>
          <li>To authenticate you and keep you signed in.</li>
          <li>To store your recordings and show them only in your account dashboard.</li>
          <li>To generate shareable links for videos you explicitly choose to share.</li>
        </ul>

        <h2>What the Chrome extension accesses</h2>
        <p>
          The extension requests only the <code>storage</code> permission, used to keep your
          login token and recording state on your device. It does <strong>not</strong> read your
          browsing history, monitor the pages you visit, or access data on websites. Screen
          capture happens only after you explicitly click "Start Recording" and pick a screen
          or window using your browser's native picker.
        </p>

        <h2>Sharing of information</h2>
        <p>
          We do not sell or rent your personal information. Videos are private to your account
          unless you share a link. Anyone who has a share link can view that specific video —
          please only share links with people you trust.
        </p>

        <h2>Data retention &amp; deletion</h2>
        <p>
          You can delete any recording from your dashboard at any time, which permanently
          removes it from our media host. To delete your account and all associated data,
          contact us at the email below.
        </p>

        <h2>Third-party services</h2>
        <ul>
          <li><strong>Cloudinary</strong> — video storage and delivery.</li>
          <li><strong>Railway</strong> — application hosting.</li>
          <li><strong>Vercel</strong> — web dashboard hosting.</li>
        </ul>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Email us at{' '}
          <a href="mailto:codingclicks@gmail.com">codingclicks@gmail.com</a>.
        </p>

        <p className={styles.footer}><Link to="/">← Back to ScreenRec</Link></p>
      </div>
    </div>
  );
}
