import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import s from './Paywall.module.css';

// Per-feature paywall copy. Keyed by the same feature strings the server returns
// in `feature` on a 403, so a locked endpoint maps straight to the right modal.
const FEATURE_COPY = {
  analytics: {
    icon: '📊', title: 'See who’s watching',
    text: 'Viewer analytics shows you who watched, how far they got, and what they reacted to.',
    bullets: ['Per-viewer watch data', 'Engagement & drop-off', 'Reactions on the timeline'],
  },
  customThumbnail: {
    icon: '🖼️', title: 'Custom thumbnails',
    text: 'Upload your own thumbnail so every share looks polished and on-brand.',
    bullets: ['Upload any image', 'Stand out in DMs & docs', 'Consistent branding'],
  },
  removeBranding: {
    icon: '✨', title: 'Remove VeoRec branding',
    text: 'Share clean, white-label videos with no VeoRec watermark.',
    bullets: ['No watermark', 'Your brand, not ours', 'Look professional'],
  },
  passwordProtection: {
    icon: '🔒', title: 'Password-protect videos',
    text: 'Lock sensitive recordings behind a password so only the right people watch.',
    bullets: ['Per-video passwords', 'Control access', 'Share safely with clients'],
  },
  priorityProcessing: {
    icon: '⚡', title: 'Priority processing',
    text: 'Skip the queue — your recordings are ready to share faster.',
    bullets: ['Front-of-line processing', 'Faster share links', 'Less waiting'],
  },
  recordingLength: {
    icon: '⏱️', title: 'Record up to 2 hours',
    text: 'Free recordings stop at 5 minutes. Pro lets you record full meetings and walkthroughs.',
    bullets: ['Up to 120-minute recordings', 'Full meetings & demos', 'No mid-record cutoff'],
  },
  storage: {
    icon: '💾', title: 'Need more storage',
    text: 'You’ve hit your 2 GB free limit. Pro gives you 100 GB — room for hundreds of videos.',
    bullets: ['100 GB storage', '1080p HD exports', 'Unlimited videos'],
  },
  default: {
    icon: '🚀', title: 'Unlock VeoRec Pro',
    text: 'This is a Pro feature. Upgrade to unlock everything VeoRec has to offer.',
    bullets: ['100 GB storage', '2-hour recordings', '1080p, analytics & more'],
  },
};

export default function UpgradeModal({ open, feature = 'default', reason, onClose }) {
  const navigate = useNavigate();
  const copy = FEATURE_COPY[feature] || FEATURE_COPY.default;

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <button className={s.modalClose} onClick={onClose} aria-label="Close">×</button>
        <div className={s.modalIcon}>{copy.icon}</div>
        <h2 className={s.modalTitle}>{copy.title}</h2>
        <p className={s.modalText}>{reason || copy.text}</p>
        <ul className={s.modalFeatures}>
          {copy.bullets.map((b, i) => (
            <li key={i}><span className={s.modalCheck}>✓</span> {b}</li>
          ))}
        </ul>
        <div className={s.modalActions}>
          <button className={s.primaryBtn} onClick={() => { onClose?.(); navigate('/pricing'); }}>
            Upgrade to Pro — $7.99/mo
          </button>
          <button className={s.ghostBtn} onClick={onClose}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}
