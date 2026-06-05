import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api';
import s from './Landing.module.css';

// Fallback plan data mirrors server/plans.js so the page renders even if the
// API is briefly unreachable. Live data overrides it on load.
const FALLBACK = [
  {
    slug: 'free', name: 'Free', monthlyPrice: 0, yearlyPrice: 0, badge: null,
    features: { removeBrandingEnabled: false, analyticsEnabled: false, customThumbnailEnabled: false, passwordProtectedVideosEnabled: false, priorityProcessingEnabled: false },
    recordingLimitMinutes: 5, storageLimitGB: 2, exportQuality: '720p',
  },
  {
    slug: 'pro', name: 'Pro', monthlyPrice: 7.99, yearlyPrice: 79, badge: 'Most Popular', yearlyBadge: '2 Months Free',
    features: { removeBrandingEnabled: true, analyticsEnabled: true, customThumbnailEnabled: true, passwordProtectedVideosEnabled: true, priorityProcessingEnabled: true },
    recordingLimitMinutes: 120, storageLimitGB: 100, exportQuality: '1080p',
  },
];

const FEATURES = [
  { icon: '🎥', tint: s.tintPurple, title: 'Record effortlessly', text: 'Capture your screen, camera and mic in stunning quality.' },
  { icon: '🔗', tint: s.tintGreen, title: 'Share instantly', text: 'Get a shareable link in seconds. No uploads. No waiting.' },
  { icon: '📈', tint: s.tintPink, title: 'Powerful insights', text: 'See who watched, how much, and what they clicked.' },
  { icon: '📁', tint: s.tintAmber, title: 'Stay organized', text: 'Folders, workspace and everything in its place.' },
];

const STEPS = [
  { n: 1, icon: '🎬', tint: s.tintPurple, title: 'Record', text: 'Choose what to record and hit start.' },
  { n: 2, icon: '🔗', tint: s.tintGreen, title: 'Share', text: 'Get your link instantly and share anywhere.' },
  { n: 3, icon: '💬', tint: s.tintAmber, title: 'Get feedback', text: 'Viewers watch and reply with comments.' },
  { n: 4, icon: '✅', tint: s.tintPink, title: 'Close faster', text: 'Move projects forward without meetings.' },
];

function planRows(plan) {
  const f = plan.features || {};
  if (plan.slug === 'free') {
    return ['Unlimited recordings', 'Up to 5 minutes per video', '720p quality', 'Shareable links', 'Screen + mic recording'];
  }
  return [
    'Everything in Free',
    `Up to ${Math.round((plan.recordingLimitMinutes || 120) / 60)}-hour recordings`,
    `${plan.exportQuality || '1080p'} HD quality`,
    'Remove VeoRec branding',
    'Password-protected videos',
    'Viewer analytics',
    'Priority processing',
  ];
}

export default function Landing() {
  const [plans, setPlans] = useState(FALLBACK);
  const [cycle, setCycle] = useState('monthly');

  useEffect(() => {
    fetch(`${API}/api/plans`)
      .then((r) => r.json())
      .then((d) => { if (d?.plans?.length) setPlans(d.plans); })
      .catch(() => {});
  }, []);

  const free = plans.find((p) => p.slug === 'free') || FALLBACK[0];
  const pro = plans.find((p) => p.slug === 'pro') || FALLBACK[1];

  return (
    <div className={s.page}>
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className={s.nav}>
        <Link to="/" className={s.brand}><img src="/logo.png" alt="" className={s.brandLogo} />VeoRec</Link>
        <nav className={s.navLinks}>
          <a href="#features">Product</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className={s.navCta}>
          <Link to="/login" className={s.signIn}>Sign in</Link>
          <Link to="/signup" className={s.getStarted}>Get Started Free</Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className={s.hero}>
        <div className={s.heroLeft}>
          <span className={s.pill}>✨ The new standard for async communication</span>
          <h1 className={s.h1}>Say it once.<br /><span className={s.accent}>Get it done.</span></h1>
          <p className={s.heroSub}>
            Record your screen, share instantly, and communicate with clarity.
            No meetings. No back and forth.
          </p>
          <div className={s.heroBtns}>
            <Link to="/signup" className={s.primaryBtn}><span className={s.recDot} /> Start Recording Free</Link>
            <a href="#how" className={s.secondaryBtn}>▶ Watch Demo</a>
          </div>
          <div className={s.trustBadges}>
            <span>✓ No credit card</span>
            <span>✓ Unlimited recordings</span>
            <span>✓ Free forever</span>
          </div>
        </div>

        {/* CSS product mockup */}
        <div className={s.heroRight}>
          <div className={s.mockup}>
            <div className={s.mockHeader}>
              <img src="/logo.png" alt="" className={s.mockLogo} />
              <span className={s.mockBrand}>VeoRec</span>
              <div className={s.mockSearch}>Search recordings…</div>
            </div>
            <div className={s.mockBody}>
              <aside className={s.mockSidebar}>
                <div className={`${s.mockNav} ${s.mockNavActive}`}>● Record</div>
                <div className={s.mockNav}>▦ Library</div>
                <div className={s.mockNav}>▭ Folders</div>
                <div className={s.mockNav}>▤ Analytics</div>
                <div className={s.mockNav}>⚙ Settings</div>
              </aside>
              <div className={s.mockGrid}>
                <div className={s.mockLabel}>History</div>
                <div className={s.mockCards}>
                  {[['Product Walkthrough', '2 days ago'], ['Onboarding Flow', '3 days ago'], ['Feature Explainer', '2 days ago'], ['Bug Repro', '4 days ago'], ['Design Review', '5 days ago'], ['Sales Demo', '1 week ago']].map(([t, d], i) => (
                    <div key={i} className={s.mockCard}>
                      <div className={s.mockThumb}><span className={s.mockDur}>3:00</span></div>
                      <div className={s.mockCardTitle}>{t}</div>
                      <div className={s.mockCardMeta}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* floating camera bubble + control bar */}
            <div className={s.bubble}><div className={s.bubbleInner}>🙂</div></div>
            <div className={s.controlBar}>
              <div className={s.ctrl}><span>📹</span><small>Camera<br />On</small></div>
              <div className={s.ctrl}><span>🎙️</span><small>Mic<br />On</small></div>
              <div className={s.ctrl}><span>🎚️</span><small>Quality<br />1080p</small></div>
              <div className={s.ctrl}><span>⏱️</span><small>Countdown<br />3 sec</small></div>
              <div className={s.recBtn} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip (placeholder — swap for real proof) ─────────────────── */}
      <section className={s.trust}>
        <p className={s.trustLabel}>BUILT FOR FREELANCERS, AGENCIES &amp; REMOTE TEAMS</p>
        <div className={s.trustRow}>
          <span>Designers</span><span>Developers</span><span>Consultants</span>
          <span>Agencies</span><span>Founders</span><span>Support teams</span>
        </div>
      </section>

      {/* ── Feature cards ───────────────────────────────────────────────────── */}
      <section id="features" className={s.section}>
        <div className={s.featureGrid}>
          {FEATURES.map((f, i) => (
            <div key={i} className={s.featureCard}>
              <div className={`${s.featureIcon} ${f.tint}`}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section id="how" className={s.section}>
        <h2 className={s.h2}>How <span className={s.accent}>VeoRec</span> works</h2>
        <div className={s.steps}>
          {STEPS.map((st, i) => (
            <div key={i} className={s.step}>
              <div className={`${s.stepIcon} ${st.tint}`}>{st.icon}</div>
              <div className={s.stepNum}>{st.n}</div>
              <h4>{st.title}</h4>
              <p>{st.text}</p>
              {i < STEPS.length - 1 && <div className={s.stepLine} />}
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonial (placeholder — replace with a real one) ─────────────── */}
      <section className={s.section}>
        <div className={s.testimonial}>
          <div className={s.quoteMark}>“</div>
          <blockquote>
            VeoRec replaced a dozen status meetings a week. I record a two-minute
            walkthrough, drop the link, and everyone’s unblocked — on their own time.
          </blockquote>
          <div className={s.author}>
            <div className={s.authorAvatar} />
            <div>
              <strong>Your customer here</strong>
              <small>Add a real testimonial once you have one</small>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing (live from /api/plans) ──────────────────────────────────── */}
      <section id="pricing" className={s.section}>
        <h2 className={s.h2}>Simple pricing. No surprises.</h2>
        <div className={s.cycleToggle}>
          <button className={cycle === 'monthly' ? s.cycleActive : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button className={cycle === 'yearly' ? s.cycleActive : ''} onClick={() => setCycle('yearly')}>
            Yearly <span className={s.save}>2 months free</span>
          </button>
        </div>

        <div className={s.pricing}>
          {/* Free */}
          <div className={s.priceCard}>
            <div className={s.priceName}>Free</div>
            <div className={s.priceAmt}>$0<span>forever</span></div>
            <ul>{planRows(free).map((r, i) => <li key={i}>✓ {r}</li>)}</ul>
            <Link to="/signup" className={s.priceBtnGhost}>Get Started</Link>
          </div>

          {/* Pro */}
          <div className={`${s.priceCard} ${s.priceFeatured}`}>
            <span className={s.popular}>Most Popular</span>
            <div className={s.priceName}>Pro</div>
            <div className={s.priceAmt}>
              ${cycle === 'yearly' ? pro.yearlyPrice : pro.monthlyPrice}
              <span>{cycle === 'yearly' ? 'per year' : 'per month'}</span>
            </div>
            <div className={s.priceNote}>
              {cycle === 'yearly' ? `Just $${(pro.yearlyPrice / 12).toFixed(2)}/mo · 2 months free` : 'Billed monthly'}
            </div>
            <ul>{planRows(pro).map((r, i) => <li key={i}>✓ {r}</li>)}</ul>
            <Link to="/signup" className={s.priceBtnPrimary}>Upgrade to Pro</Link>
          </div>

          {/* Business — coming soon (pre-architected) */}
          <div className={`${s.priceCard} ${s.priceSoon}`}>
            <div className={s.priceName}>Business <span className={s.soonTag}>Soon</span></div>
            <div className={s.priceAmt}>$24<span>per user / mo</span></div>
            <ul>
              <li>✓ Everything in Pro</li>
              <li>✓ Team workspaces</li>
              <li>✓ Shared libraries</li>
              <li>✓ Advanced analytics</li>
              <li>✓ SSO (SAML)</li>
              <li>✓ Admin controls</li>
            </ul>
            <button className={s.priceBtnGhost} disabled>Coming soon</button>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────────────────── */}
      <section className={s.ctaBanner}>
        <div className={s.ctaInner}>
          <div className={s.ctaIcon}><img src="/logo.png" alt="" /></div>
          <div className={s.ctaText}>
            <strong>Ready to create your first video?</strong>
            <span>Join the freelancers and teams who share with VeoRec.</span>
          </div>
          <Link to="/signup" className={s.ctaBtn}>Start Recording Free →</Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className={s.footer}>
        <div className={s.footBrand}><img src="/logo.png" alt="" className={s.brandLogo} />VeoRec</div>
        <div className={s.footLinks}>
          <Link to="/pricing">Pricing</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/refund">Refund</Link>
          <a href="mailto:codingclicks@gmail.com">Contact</a>
        </div>
        <div className={s.footCopy}>© {new Date().getFullYear()} VeoRec</div>
      </footer>
    </div>
  );
}
