// ─────────────────────────────────────────────────────────────────────────────
// INFRA COST & FREE-TIER MODEL  —  powers the admin "Business" dashboard.
//
// Prices are 2026 list prices; variable usage is ESTIMATED where we can't measure
// it from our own data. Every number is overridable via env (no redeploy needed
// for the fixed costs if you set them in Railway), so you can keep this honest as
// your real bills come in. The one platform we measure for real is Cloudinary
// (via its usage API) — that's also the one most likely to bind first.
// ─────────────────────────────────────────────────────────────────────────────
const num = (k, d) => (process.env[k] != null && process.env[k] !== '' ? Number(process.env[k]) : d);

const PLATFORMS = [
  {
    key: 'cloudinary',
    name: 'Cloudinary',
    what: 'Video storage, transcoding & delivery',
    metricLabel: 'credits',
    metricHint: '1 credit ≈ 1 GB storage · 1 GB delivery · 1k transforms',
    freeLimit: num('CLOUDINARY_FREE_CREDITS', 25),     // free plan = 25 credits/mo
    currentTier: process.env.CLOUDINARY_TIER || 'Free',
    monthlyCost: num('CLOUDINARY_MONTHLY_COST', 0),
    nextTier: { name: 'Plus', monthlyCost: num('CLOUDINARY_NEXT_COST', 89), freeLimit: num('CLOUDINARY_NEXT_CREDITS', 225) },
    primary: true,   // video-heavy → most likely to hit the ceiling first
  },
  {
    key: 'railway',
    name: 'Railway',
    what: 'Backend API + self-hosted Whisper',
    metricLabel: '$ compute/mo',
    metricHint: 'Metered vCPU + RAM; Hobby plan includes $5 of usage',
    freeLimit: num('RAILWAY_INCLUDED_USD', 5),
    currentTier: process.env.RAILWAY_TIER || 'Hobby',
    monthlyCost: num('RAILWAY_MONTHLY_COST', 5),
    estimatedUsage: num('RAILWAY_EST_USAGE_USD', 4),   // est. compute consumed so far this month
    nextTier: { name: 'Pro', monthlyCost: num('RAILWAY_NEXT_COST', 20), freeLimit: num('RAILWAY_NEXT_INCLUDED', 20) },
  },
  {
    key: 'vercel',
    name: 'Vercel',
    what: 'Web app hosting & CDN',
    metricLabel: 'GB bandwidth/mo',
    metricHint: 'Hobby (free): 100 GB/mo — videos are served by Cloudinary, not here',
    freeLimit: num('VERCEL_FREE_GB', 100),
    currentTier: process.env.VERCEL_TIER || 'Hobby (free)',
    monthlyCost: num('VERCEL_MONTHLY_COST', 0),
    estimatedUsage: process.env.VERCEL_EST_GB != null ? num('VERCEL_EST_GB', 0) : null,
    nextTier: { name: 'Pro', monthlyCost: num('VERCEL_NEXT_COST', 20), freeLimit: num('VERCEL_NEXT_GB', 1024) },
  },
  {
    key: 'brevo',
    name: 'Brevo',
    what: 'Transactional email (resets, invites)',
    metricLabel: 'emails/day',
    metricHint: 'Free: 300 emails/day',
    freeLimit: num('BREVO_FREE_DAILY', 300),
    currentTier: process.env.BREVO_TIER || (process.env.BREVO_API_KEY ? 'Free' : 'Not connected'),
    monthlyCost: num('BREVO_MONTHLY_COST', 0),
    estimatedUsage: num('BREVO_EST_DAILY', 0),
    nextTier: { name: 'Starter', monthlyCost: num('BREVO_NEXT_COST', 9), freeLimit: num('BREVO_NEXT_DAILY', 666) },
  },
  {
    key: 'domain',
    name: 'Domain (veorec.com)',
    what: 'Domain registration',
    metricLabel: 'fixed',
    metricHint: 'Annual registration, amortised monthly',
    freeLimit: null,
    currentTier: 'Registered',
    monthlyCost: num('DOMAIN_MONTHLY_COST', 1.25),     // ≈ $15/yr
    fixed: true,
  },
];

module.exports = { PLATFORMS };
