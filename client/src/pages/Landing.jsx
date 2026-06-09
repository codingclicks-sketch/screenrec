import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Video, Link2, LineChart, FolderOpen, Clapperboard, MessageSquare,
  CheckCircle2, Mic, Gauge, Timer, Sparkles, Play, Check, Quote,
  Plus, PlaySquare, BarChart3, Monitor, AppWindow,
} from 'lucide-react';
import API from '../api';
import s from './Landing.module.css';

const FALLBACK = [
  { slug: 'free', name: 'Free', monthlyPrice: 0, yearlyPrice: 0, badge: null,
    features: { removeBrandingEnabled: false, analyticsEnabled: false, customThumbnailEnabled: false, passwordProtectedVideosEnabled: false, priorityProcessingEnabled: false, transcriptionEnabled: false },
    recordingLimitMinutes: 5, storageLimitGB: 2, exportQuality: '720p' },
  { slug: 'pro', name: 'Pro', monthlyPrice: 7.99, yearlyPrice: 79, badge: 'Most Popular', yearlyBadge: '2 Months Free',
    features: { removeBrandingEnabled: true, analyticsEnabled: true, customThumbnailEnabled: true, passwordProtectedVideosEnabled: true, priorityProcessingEnabled: true, transcriptionEnabled: true },
    recordingLimitMinutes: 120, storageLimitGB: 100, exportQuality: '1080p' },
];

const FEATURES = [
  { Icon: Video, color: '#6366f1', tint: s.tintPurple, title: 'Record effortlessly', text: 'Capture your screen, camera and mic in stunning quality.' },
  { Icon: Link2, color: '#16a34a', tint: s.tintGreen, title: 'Share instantly', text: 'Get a shareable link in seconds. No uploads. No waiting.' },
  { Icon: LineChart, color: '#ec4899', tint: s.tintPink, title: 'Powerful insights', text: 'See who watched, how much, and what they clicked.' },
  { Icon: FolderOpen, color: '#f59e0b', tint: s.tintAmber, title: 'Stay organized', text: 'Folders, workspace and everything in its place.' },
];

const STEPS = [
  { Icon: Clapperboard, color: '#6366f1', tint: s.tintPurple, title: 'Record', text: 'Choose what to record and hit start.' },
  { Icon: Link2, color: '#16a34a', tint: s.tintGreen, title: 'Share', text: 'Get your link instantly and share anywhere.' },
  { Icon: MessageSquare, color: '#f59e0b', tint: s.tintAmber, title: 'Get feedback', text: 'Viewers watch and reply with comments.' },
  { Icon: CheckCircle2, color: '#ec4899', tint: s.tintPink, title: 'Close faster', text: 'Move projects forward without meetings.' },
];

function planRows(plan) {
  if (plan.slug === 'free') return ['Unlimited recordings', 'Up to 5 minutes per video', '720p quality', 'Shareable links', 'Screen + mic recording'];
  return ['Everything in Free', `Up to ${Math.round((plan.recordingLimitMinutes || 120) / 60)}-hour recordings`,
    `${plan.exportQuality || '1080p'} HD quality`, 'Remove VeoRec branding', 'Password-protected videos', 'Viewer analytics', 'Priority processing'];
}

export default function Landing() {
  const [plans, setPlans] = useState(FALLBACK);
  const [cycle, setCycle] = useState('monthly');

  useEffect(() => {
    fetch(`${API}/api/plans`).then((r) => r.json()).then((d) => { if (d?.plans?.length) setPlans(d.plans); }).catch(() => {});
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
          <Link to="/contact">Contact</Link>
        </nav>
        <div className={s.navCta}>
          <Link to="/login" className={s.signIn}>Sign in</Link>
          <Link to="/signup" className={s.getStarted}>Get Started Free</Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className={s.hero}>
        <div className={s.heroLeft}>
          <span className={s.pill}><Sparkles size={14} /> The new standard for async communication</span>
          <h1 className={s.h1}>Say it once.<br /><span className={s.accent}>Get it done.</span></h1>
          <p className={s.heroSub}>Record your screen, share instantly, and communicate with clarity. No meetings. No back and forth.</p>
          <div className={s.heroBtns}>
            <Link to="/signup" className={s.primaryBtn}><span className={s.recDot} /> Start Recording Free</Link>
            <a href="#how" className={s.secondaryBtn}><Play size={16} fill="currentColor" /> Watch Demo</a>
          </div>
          <div className={s.trustBadges}>
            <span><Check size={15} color="#16a34a" /> No credit card</span>
            <span><Check size={15} color="#16a34a" /> Unlimited recordings</span>
            <span><Check size={15} color="#16a34a" /> Free forever</span>
          </div>
        </div>

        {/* CSS product mockup — recreates the VeoRec dashboard + floating panels */}
        <div className={s.heroRight}>
          <div className={s.mockup}>
            <div className={s.mockHeader}>
              <img src="/logo.png" alt="" className={s.mockLogo} />
              <span className={s.mockBrand}>VeoRec</span>
              <div className={s.mockSearch}>Search recordings… <span className={s.mockKbd}>⌘K</span></div>
              <div className={s.mockRecord}><Plus size={12} /> Record</div>
            </div>
            <div className={s.mockBody}>
              <aside className={s.mockSidebar}>
                <div className={`${s.mockNav} ${s.mockNavActive}`}><PlaySquare size={13} /> Library</div>
                <div className={s.mockNav}><FolderOpen size={13} /> Folders</div>
                <div className={s.mockNav}><BarChart3 size={13} /> Analytics</div>
                <div className={s.mockStorage}>
                  <div className={s.mockStorageLabel}>Storage</div>
                  <div className={s.mockStorageBar}><span style={{ width: '12%' }} /></div>
                  <div className={s.mockStorageMeta}>1.2 / 10 GB</div>
                </div>
                <div className={s.mockUpgrade}><Sparkles size={12} color="#6366f1" /> Upgrade to Pro</div>
              </aside>
              <div className={s.mockGrid}>
                <div className={s.mockLabel}>Library <span>24 videos</span></div>
                <div className={s.mockCards}>
                  {[['Product Walkthrough', '2:34'], ['Onboarding Flow', '1:48'], ['Feature Explainer', '2:15'], ['Bug Report', '1:12'], ['Design Review', '3:06'], ['Quick Update', '0:56']].map(([t, dur], i) => (
                    <div key={i} className={s.mockCard}>
                      <div className={s.mockThumb}><span className={s.mockDur}>{dur}</span></div>
                      <div className={s.mockCardTitle}>{t}</div>
                      <div className={s.mockCardMeta}>{[42, 18, 32, 9, 26, 14][i]} views</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Floating record control panel (bottom-left) */}
          <div className={s.recPanel}>
            <div className={s.recTabs}>
              <span className={s.recTabActive}><Monitor size={11} /> Entire Screen</span>
              <span className={s.recTab}><AppWindow size={11} /> Browser Tab</span>
              <span className={s.recTab}>Window</span>
            </div>
            {[[Video, 'Camera', 'On'], [Mic, 'Microphone', 'On'], [Gauge, 'Quality', '1080p'], [Timer, 'Countdown', '3 sec']].map(([Ic, label, val], i) => (
              <div key={i} className={s.recRow}>
                <span className={s.recRowIcon}><Ic size={14} color="#6366f1" /></span>
                <span className={s.recRowLabel}>{label}</span>
                <span className={s.recRowVal}>{val}</span>
              </div>
            ))}
            <div className={s.recBtnBig} />
          </div>

          {/* Floating views stat card (bottom-right) */}
          <div className={s.viewsCard}>
            <div className={s.viewsTop}>
              <span className={s.viewsLabel}>Views</span>
              <span className={s.viewsNum}>12.4K</span>
              <span className={s.viewsPct}>+28%</span>
            </div>
            <div className={s.viewsChart}>
              <svg viewBox="0 0 120 40" preserveAspectRatio="none" className={s.viewsLine}>
                <polyline points="0,32 20,28 40,30 60,18 80,22 100,8 120,12" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className={s.viewsDonut} />
            </div>
          </div>

          {/* 3D camera badge */}
          <div className={s.camBadge}><Video size={28} color="#fff" /></div>
        </div>
      </section>

      {/* ── Trust strip ─────────────────────────────────────────────────────── */}
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
              <div className={`${s.featureIcon} ${f.tint}`}><f.Icon size={24} color={f.color} strokeWidth={2.2} /></div>
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
              <div className={`${s.stepIcon} ${st.tint}`}><st.Icon size={26} color={st.color} strokeWidth={2.2} /></div>
              <div className={s.stepNum}>{i + 1}</div>
              <h4>{st.title}</h4>
              <p>{st.text}</p>
              {i < STEPS.length - 1 && <div className={s.stepLine} />}
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonial (placeholder) ───────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.testimonial}>
          <div className={s.quoteMark}><Quote size={40} color="#6366f1" fill="#6366f1" /></div>
          <blockquote>VeoRec replaced a dozen status meetings a week. I record a two-minute walkthrough, drop the link, and everyone’s unblocked — on their own time.</blockquote>
          <div className={s.author}>
            <div className={s.authorAvatar} />
            <div><strong>Your customer here</strong><small>Add a real testimonial once you have one</small></div>
          </div>
        </div>
      </section>

      {/* ── Pricing (live from /api/plans) ──────────────────────────────────── */}
      <section id="pricing" className={s.section}>
        <h2 className={s.h2}>Simple pricing. No surprises.</h2>
        <div className={s.cycleToggle}>
          <button className={cycle === 'monthly' ? s.cycleActive : s.cycleBtn} onClick={() => setCycle('monthly')}>Monthly</button>
          <button className={cycle === 'yearly' ? s.cycleActive : s.cycleBtn} onClick={() => setCycle('yearly')}>
            Yearly <span className={s.save}>Save 17%</span>
          </button>
        </div>

        <div className={s.pricing}>
          <div className={s.priceCard}>
            <div className={s.priceName}>Free</div>
            <div className={s.priceAmt}>$0<span>forever</span></div>
            <div className={s.priceNote}> </div>
            <ul>{planRows(free).map((r, i) => <li key={i}><Check size={16} className={s.liCheck} /> {r}</li>)}</ul>
            <Link to="/signup" className={s.priceBtnGhost}>Get Started</Link>
          </div>

          <div className={`${s.priceCard} ${s.priceFeatured}`}>
            <span className={s.popular}>Most Popular</span>
            <div className={s.priceName}>Pro</div>
            <div className={s.priceAmt}>${cycle === 'yearly' ? pro.yearlyPrice : pro.monthlyPrice}<span>{cycle === 'yearly' ? 'per year' : 'per month'}</span></div>
            <div className={s.priceNote}>{cycle === 'yearly' ? `Just $${(pro.yearlyPrice / 12).toFixed(2)}/mo · 2 months free` : 'Billed monthly'}</div>
            <ul>{planRows(pro).map((r, i) => <li key={i}><Check size={16} className={s.liCheckPro} /> {r}</li>)}</ul>
            <Link to="/signup" className={s.priceBtnPrimary}>Upgrade to Pro</Link>
          </div>

          <div className={`${s.priceCard} ${s.priceSoon}`}>
            <div className={s.priceName}>Business <span className={s.soonTag}>Soon</span></div>
            <div className={s.priceAmt}>$24<span>per user / mo</span></div>
            <div className={s.priceNote}> </div>
            <ul>
              {['Everything in Pro', 'Team workspaces', 'Shared libraries', 'Advanced analytics', 'SSO (SAML)', 'Admin controls'].map((r, i) => (
                <li key={i}><Check size={16} className={s.liCheck} /> {r}</li>
              ))}
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
        <div className={s.footTop}>
          <div className={s.footBrandCol}>
            <div className={s.footBrand}><img src="/logo.png" alt="" className={s.brandLogo} />VeoRec</div>
            <p className={s.footBlurb}>Record your screen, share instantly, and communicate with clarity — a simple, affordable Loom alternative.</p>
            <div className={s.footBadges}>
              <span>✓ No credit card</span>
              <span>✓ Free forever plan</span>
            </div>
          </div>
          <div className={s.footCols}>
            <div className={s.footCol}>
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <Link to="/pricing">Pricing</Link>
              <Link to="/signup">Get started</Link>
            </div>
            <div className={s.footCol}>
              <h4>Company</h4>
              <Link to="/contact">Contact</Link>
              <Link to="/login">Sign in</Link>
              <a href="mailto:codingclicks@gmail.com">Support</a>
            </div>
            <div className={s.footCol}>
              <h4>Legal</h4>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/refund">Refund Policy</Link>
            </div>
          </div>
        </div>
        <div className={s.footBottom}>
          <span>© {new Date().getFullYear()} VeoRec. All rights reserved.</span>
          <span>Payments processed securely by Paddle.</span>
        </div>
      </footer>
    </div>
  );
}
