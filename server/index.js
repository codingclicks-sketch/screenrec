const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const users = require('./users');
const { meta, folders } = require('./meta');
const transcription = require('./transcription');
const { signToken, requireAuth, verifyToken } = require('./auth');

// ── Monetization layer ────────────────────────────────────────────────────────
const plans = require('./plans');
const entitlements = require('./entitlements');
const subscriptions = require('./subscriptions');
const usageService = require('./usage.service');
const permissions = require('./permissions.service');
const billingService = require('./billing.service');
const billingConfig = require('./billing.config');
const conversion = require('./conversion');
const cron = require('./cron');
const contacts = require('./contacts');
const { makeHandler: makePaddleWebhook } = require('./webhooks.paddle');

const app = express();
const PORT = process.env.PORT || 3001;
const USE_CLOUDINARY = !!(process.env.CLOUDINARY_CLOUD_NAME);

// ── Cloudinary setup ─────────────────────────────────────────────────────────
let cloudinary;
if (USE_CLOUDINARY) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
// Capture the raw body so we can verify Paddle webhook signatures.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// In-memory uploader for the editor's "replace with trimmed file" flow.
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// ── Auth Routes (public) ─────────────────────────────────────────────────────
// Serialize a user for client responses — never includes the password hash.
function publicUser(u) {
  const ent = entitlements.summary(u);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    // coarse slug kept for back-compat; UI should prefer `entitlements`
    plan: ent.planSlug,
    entitlements: ent,           // { plan{features…}, planSlug, isPaid, subscription }
    isAdmin: isAdmin(u),
    created_at: u.created_at,
  };
}

// Cloudinary context values must escape '=', '|' and '\' (and we strip newlines)
// — otherwise a title like "Q1 | 2026" or "a=b" silently breaks the context
// string and the rename fails. Build a safe context string from an object.
function ctxValue(v) { return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/([=|\\])/g, '\\$1'); }
function buildContext(obj) { return Object.entries(obj).map(([k, v]) => `${k}=${ctxValue(v)}`).join('|'); }
function cleanTitle(t) { return String(t == null ? '' : t).replace(/[\r\n]+/g, ' ').trim().slice(0, 200); }

// Admin allowlist via env (comma-separated emails). Server-side only.
function isAdmin(u) {
  const list = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return !!(u && u.email && list.includes(u.email.toLowerCase()));
}

function requireAdmin(req, res, next) {
  const u = users.findById(req.userId);
  if (!isAdmin(u)) return res.status(403).json({ error: 'Admin only' });
  req.user = u;
  next();
}

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Name, email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (users.findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), name, email: email.toLowerCase(), password: hash, plan: 'free', created_at: Date.now() };
  users.create(user);

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = users.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = users.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

// Update profile (name and/or email)
app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const user = users.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, email } = req.body;
  const fields = {};
  if (typeof name === 'string' && name.trim()) fields.name = name.trim();
  if (typeof email === 'string' && email.trim()) {
    const lower = email.trim().toLowerCase();
    const existing = users.findByEmail(lower);
    if (existing && existing.id !== user.id) return res.status(409).json({ error: 'Email already in use' });
    fields.email = lower;
  }
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update' });

  const updated = users.update(user.id, fields);
  res.json(publicUser(updated));
});

// Change password
app.patch('/api/auth/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = users.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(newPassword, 10);
  users.update(user.id, { password: hash });
  res.json({ success: true });
});

// What auth methods are configured (frontend uses this to show the Google button etc.)
app.get('/api/auth/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    emailEnabled: !!process.env.BREVO_API_KEY,
  });
});

// ── Sign in with Google ───────────────────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    const info = await r.json();
    if (!r.ok || !info.email) return res.status(401).json({ error: 'Invalid Google sign-in' });
    if (process.env.GOOGLE_CLIENT_ID && info.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Google token audience mismatch' });
    }
    if (info.email_verified === 'false') return res.status(401).json({ error: 'Google email not verified' });

    const email = info.email.toLowerCase();
    let user = users.findByEmail(email);
    if (!user) {
      user = { id: uuidv4(), name: info.name || email.split('@')[0], email, password: null, googleId: info.sub, plan: 'free', created_at: Date.now() };
      users.create(user);
    } else if (!user.googleId) {
      user = users.update(user.id, { googleId: info.sub });
    }
    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Forgot / reset password (email via Brevo) ─────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!process.env.BREVO_API_KEY) return false;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'VeoRec', email: process.env.EMAIL_FROM || 'noreply@veorec.com' },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    return r.ok;
  } catch { return false; }
}

app.post('/api/auth/forgot', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = users.findByEmail(email);
  // Only password accounts can reset; always respond ok (don't reveal who exists).
  if (user && user.password) {
    const token = crypto.randomBytes(32).toString('hex');
    users.update(user.id, { resetToken: token, resetExpires: Date.now() + 3600 * 1000 });
    const base = process.env.CLIENT_URL || 'https://veorec.com';
    const link = `${base}/reset?token=${token}&email=${encodeURIComponent(email)}`;
    await sendEmail(email, 'Reset your VeoRec password',
      `<div style="font-family:sans-serif"><h2>Reset your password</h2><p>Click the button below to set a new password. This link expires in 1 hour.</p><p><a href="${link}" style="display:inline-block;background:#5b5bf6;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p><p style="color:#888;font-size:12px">Or paste this link: ${link}</p><p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p></div>`);
  }
  res.json({ ok: true });
});

app.post('/api/auth/reset', async (req, res) => {
  const { email, token, password } = req.body;
  if (!email || !token || !password) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const user = users.findByEmail(String(email).toLowerCase());
  if (!user || user.resetToken !== token || !user.resetExpires || user.resetExpires < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }
  const hash = await bcrypt.hash(password, 10);
  const updated = users.update(user.id, { password: hash, resetToken: null, resetExpires: null });
  res.json({ token: signToken(updated.id), user: publicUser(updated) });
});

// ── Upload / Recordings (protected) ──────────────────────────────────────────
if (!USE_CLOUDINARY) {
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `${uuidv4()}.webm`),
  });
  const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });
  app.use('/uploads', express.static(uploadDir));

  app.post('/api/upload', requireAuth, upload.single('video'), (req, res) => {
    const { title, duration } = req.body;
    const id = uuidv4();
    const user = users.findById(req.userId);
    const durationSec = parseInt(duration) || 0;
    const sizeBytes = req.file.size || 0;

    // Server-side enforcement (mirrors the Cloudinary branch).
    const recCheck = permissions.canRecord(user, durationSec);
    if (!recCheck.allowed) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      conversion.track({ userId: user.id, userPlan: recCheck.meta?.plan, featureRequested: conversion.TRIGGERS.RECORDING_LIMIT, meta: recCheck.meta });
      return res.status(403).json({ error: recCheck.reason, upgradeRequired: true, code: 'recording_limit', meta: recCheck.meta });
    }
    const storeCheck = permissions.canUploadVideo(user, sizeBytes);
    if (!storeCheck.allowed) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      conversion.track({ userId: user.id, userPlan: storeCheck.meta?.plan, featureRequested: conversion.TRIGGERS.STORAGE_FULL, meta: storeCheck.meta });
      return res.status(403).json({ error: storeCheck.reason, upgradeRequired: true, code: 'storage_limit', meta: storeCheck.meta });
    }

    db.insert({ id, userId: req.userId, title: title || 'Untitled Recording',
      filename: req.file.filename, size: sizeBytes,
      duration: durationSec, created_at: Date.now() });
    usageService.updateUsage(req.userId, { bytes: sizeBytes, videos: 1, seconds: durationSec, upload: true });
    const base = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    res.json({ id, url: `${base}/watch/${id}` });
  });

  app.get('/api/recordings', requireAuth, (req, res) => {
    res.json(db.all().filter(r => r.userId === req.userId));
  });

  app.get('/api/recordings/:id', requireAuth, (req, res) => {
    const row = db.get(req.params.id);
    if (!row || row.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    const m = meta.get(req.params.id);
    res.json({ ...row, filename: `${process.env.PUBLIC_URL || ''}/uploads/${row.filename}`, trimStart: m.trimStart, trimEnd: m.trimEnd, segments: m.segments });
  });

  app.delete('/api/recordings/:id', requireAuth, (req, res) => {
    const row = db.get(req.params.id);
    if (!row || row.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    const p = path.join(__dirname, 'uploads', row.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    db.delete(req.params.id);
    usageService.updateUsage(req.userId, { bytes: -(row.size || 0), videos: -1, seconds: -(row.duration || 0) });
    res.json({ success: true });
  });

  app.patch('/api/recordings/:id', requireAuth, (req, res) => {
    const row = db.get(req.params.id);
    if (!row || row.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    const title = cleanTitle(req.body.title);
    if (!title) return res.status(400).json({ error: 'Title cannot be empty' });
    db.update(req.params.id, { title });
    res.json({ success: true, title });
  });

} else {
  // ── Cloudinary routes ──────────────────────────────────────────────────────
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

  app.post('/api/upload', requireAuth, upload.single('video'), async (req, res) => {
    try {
      const { title, duration } = req.body;
      const id = uuidv4();
      const recTitle = title || 'Untitled Recording';
      const user = users.findById(req.userId);
      const durationSec = parseInt(duration) || 0;
      const sizeBytes = req.file?.size || req.file?.buffer?.length || 0;

      // ── SERVER-SIDE ENFORCEMENT (never trust the client) ───────────────────
      // 1) Recording length limit.
      const recCheck = permissions.canRecord(user, durationSec);
      if (!recCheck.allowed) {
        conversion.track({ userId: user.id, userPlan: recCheck.meta?.plan,
          featureRequested: conversion.TRIGGERS.RECORDING_LIMIT, meta: recCheck.meta });
        return res.status(403).json({ error: recCheck.reason, upgradeRequired: true, code: 'recording_limit', meta: recCheck.meta });
      }
      // 2) Storage limit (primary free-plan limiter).
      const storeCheck = permissions.canUploadVideo(user, sizeBytes);
      if (!storeCheck.allowed) {
        conversion.track({ userId: user.id, userPlan: storeCheck.meta?.plan,
          featureRequested: conversion.TRIGGERS.STORAGE_FULL, meta: storeCheck.meta });
        return res.status(403).json({ error: storeCheck.reason, upgradeRequired: true, code: 'storage_limit', meta: storeCheck.meta });
      }

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: `screenrec/${req.userId}`,
            public_id: id,
            context: `title=${recTitle}|duration=${duration || 0}|created_at=${Date.now()}|rec_id=${id}|user_id=${req.userId}`,
          },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file.buffer);
      });

      // ── Usage accounting (incremental; cron heals any drift) ───────────────
      usageService.updateUsage(req.userId, {
        bytes: result.bytes || sizeBytes,
        videos: 1,
        seconds: Math.round(result.duration || durationSec),
        upload: true,
      });

      const base = process.env.PUBLIC_URL || `https://${req.get('host')}`;
      const clientBase = process.env.CLIENT_URL || base;
      res.json({ id, url: `${clientBase}/watch/${id}` });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/recordings', requireAuth, async (req, res) => {
    try {
      const prefix = `screenrec/${req.userId}/`;
      // Cloudinary's Search API is rich but EVENTUALLY consistent — a freshly
      // trimmed/created asset won't appear in it for a while, which made trimmed
      // videos "disappear" from the library. The Admin API (list by prefix) is
      // IMMEDIATELY consistent. Merge both: search gives reliable duration for
      // settled assets; the Admin API surfaces brand-new ones right away.
      const [searchRes, adminRes] = await Promise.all([
        cloudinary.search
          .expression(`folder:screenrec/${req.userId} AND resource_type:video`)
          .with_field('context').sort_by('created_at', 'desc').max_results(200).execute()
          .catch(() => ({ resources: [] })),
        cloudinary.api
          .resources({ resource_type: 'video', type: 'upload', prefix, max_results: 200, context: true })
          .catch(() => ({ resources: [] })),
      ]);

      const byId = new Map();
      for (const r of searchRes.resources) byId.set(r.public_id, r);
      for (const r of adminRes.resources) if (!byId.has(r.public_id)) byId.set(r.public_id, r);

      const rows = [...byId.values()]
        .filter(r => !/__trim_\d+$/.test(r.public_id)) // skip in-flight trim temp artifacts
        .map(r => {
          const ctx = r.context?.custom || {};
          const id = ctx.rec_id || r.public_id.split('/').pop();
          const m = meta.get(id);
          return {
            id,
            title: m.title || ctx.title || 'Untitled Recording',
            filename: r.secure_url,
            // Cloudinary-generated poster image (fast thumbnail, no full video load)
            thumbnail: r.secure_url.replace(/\.(webm|mp4|mov|mkv)$/, '.jpg').replace('/upload/', '/upload/so_0/'),
            size: r.bytes,
            // Prefer Cloudinary's measured duration; fall back to the value we
            // store in context (set on trim/copy, available before search indexes).
            duration: Math.round(r.duration || parseInt(ctx.duration) || 0),
            created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
            cloudinary: true,
            public_id: r.public_id,
            views: m.views,
            description: m.description,
            privacy: m.privacy,
            cta: m.cta,
            folder: m.folder,
            trimStart: m.trimStart,
            trimEnd: m.trimEnd,
            commentCount: m.comments.length,
          };
        })
        .sort((a, b) => b.created_at - a.created_at);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/recordings/:id', requireAuth, async (req, res) => {
    try {
      const publicId = `screenrec/${req.userId}/${req.params.id}`;
      // Search across user's folder
      const result = await cloudinary.search
        .expression(`folder:screenrec/${req.userId} AND resource_type:video AND public_id:${publicId}`)
        .with_field('context')
        .max_results(1)
        .execute()
        .catch(() => ({ resources: [] }));

      let r = result.resources[0];
      // Search index lags right after a trim/copy — fall back to the immediately
      // consistent Admin API so the owner can open/edit it without waiting.
      if (!r) {
        try { r = await cloudinary.api.resource(publicId, { resource_type: 'video', context: true }); } catch {}
      }
      if (!r) return res.status(404).json({ error: 'Not found' });
      const ctx = r.context?.custom || {};
      const m = meta.get(req.params.id);
      res.json({
        id: req.params.id,
        title: m.title || ctx.title || 'Untitled Recording',
        filename: r.secure_url,
        size: r.bytes,
        duration: Math.round(r.duration || parseInt(ctx.duration) || 0),
        created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
        cloudinary: true,
        public_id: r.public_id,
        trimStart: m.trimStart, trimEnd: m.trimEnd, segments: m.segments,
        canTranscribe: permissions.canUseTranscription(users.findById(req.userId)).allowed,
      });
    } catch (e) {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.delete('/api/recordings/:id', requireAuth, async (req, res) => {
    try {
      // Look up size/duration first so we can decrement usage accurately.
      let freedBytes = 0, freedSeconds = 0;
      try {
        const r = await cloudinary.search
          .expression(`resource_type:video AND public_id=screenrec/${req.userId}/${req.params.id}`)
          .max_results(1).execute();
        if (r.resources.length) { freedBytes = r.resources[0].bytes || 0; freedSeconds = Math.round(r.resources[0].duration || 0); }
      } catch {}

      await cloudinary.uploader.destroy(`screenrec/${req.userId}/${req.params.id}`, { resource_type: 'video' });
      meta.remove(req.params.id);
      usageService.updateUsage(req.userId, { bytes: -freedBytes, videos: -1, seconds: -freedSeconds });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/recordings/:id', requireAuth, async (req, res) => {
    const title = cleanTitle(req.body.title);
    if (!title) return res.status(400).json({ error: 'Title cannot be empty' });
    try {
      if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
      // Source of truth for reads = meta.json (instant). Cloudinary context is
      // updated too as a durable mirror, but its search index lags, so we never
      // rely on it for display (that was the "rename reverts on refresh" bug).
      meta.set(req.params.id, { title });
      await cloudinary.uploader.add_context(
        buildContext({ title }),
        [`screenrec/${req.userId}/${req.params.id}`],
        { resource_type: 'video' }
      );
      res.json({ success: true, title });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function findVideo(id) {
  if (USE_CLOUDINARY) {
    let result = await cloudinary.search
      .expression(`resource_type:video AND context.rec_id=${id}`)
      .with_field('context').max_results(1).execute();
    if (!result.resources.length) {
      result = await cloudinary.search
        .expression(`resource_type:video AND public_id=screenrec/${id}`)
        .with_field('context').max_results(1).execute();
    }
    if (!result.resources.length) return null;
    const r = result.resources[0];
    const ctx = r.context?.custom || {};
    return {
      id,
      title: ctx.title || 'Untitled Recording',
      filename: r.secure_url,
      thumbnail: r.secure_url.replace(/\.(webm|mp4|mov|mkv)$/, '.jpg').replace('/upload/', '/upload/so_0/'),
      duration: Math.round(r.duration || parseInt(ctx.duration) || 0),
      created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
      cloudinary: true,
    };
  }
  return db.get(id) || null;
}

async function userOwns(userId, id) {
  if (!USE_CLOUDINARY) { const row = db.get(id); return !!(row && row.userId === userId); }
  const r = await cloudinary.search
    .expression(`resource_type:video AND public_id=screenrec/${userId}/${id}`)
    .max_results(1).execute();
  return r.resources.length > 0;
}

function viewerFromAuth(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try { const { userId } = verifyToken(auth.slice(7)); return users.findById(userId); } catch {}
  }
  return null;
}

// ── Watch route (public, privacy-aware) ──────────────────────────────────────
app.get('/api/watch/:id', async (req, res) => {
  try {
    const video = await findVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Not found' });
    const m = meta.get(req.params.id);

    if (m.privacy === 'login' && !viewerFromAuth(req)) {
      return res.status(401).json({ error: 'login_required', title: m.title || video.title });
    }
    if (m.privacy === 'password' && m.passwordHash) {
      return res.json({ id: video.id, title: m.title || video.title, requiresPassword: true });
    }
    res.json({ ...video, title: m.title || video.title, description: m.description, cta: m.cta, privacy: m.privacy, trimStart: m.trimStart, trimEnd: m.trimEnd, segments: m.segments, tags: m.tags, audience: m.audience, recommendedSpeed: m.recommendedSpeed });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// Unlock a password-protected video
app.post('/api/watch/:id/unlock', async (req, res) => {
  try {
    const m = meta.get(req.params.id);
    const video = await findVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Not found' });
    if (m.privacy === 'password' && m.passwordHash) {
      const ok = await bcrypt.compare(req.body.password || '', m.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Incorrect password' });
    }
    res.json({ ...video, title: m.title || video.title, description: m.description, cta: m.cta, privacy: m.privacy, trimStart: m.trimStart, trimEnd: m.trimEnd, segments: m.segments, tags: m.tags, audience: m.audience, recommendedSpeed: m.recommendedSpeed });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Engagement (public) ───────────────────────────────────────────────────────
app.post('/api/watch/:id/view', (req, res) => {
  const viewer = viewerFromAuth(req);
  const updated = meta.update(req.params.id, m => {
    m.views = (m.views || 0) + 1;
    if (viewer) m.viewers = [{ name: viewer.name, email: viewer.email, at: Date.now() }, ...(m.viewers || []).slice(0, 199)];
    return m;
  });
  res.json({ views: updated.views });
});

// Older recordings stored reactions as a tally object { emoji: count }; current
// ones use an array [{emoji,t,at}]. Always hand the client an array.
function normalizeReactions(r) {
  if (Array.isArray(r)) return r;
  if (r && typeof r === 'object') {
    return Object.entries(r).flatMap(([emoji, n]) =>
      Array.from({ length: Math.max(0, parseInt(n) || 0) }, () => ({ emoji, t: null, at: 0 })));
  }
  return [];
}

app.get('/api/watch/:id/engagement', (req, res) => {
  const m = meta.get(req.params.id);
  res.json({ views: m.views, reactions: normalizeReactions(m.reactions), comments: Array.isArray(m.comments) ? m.comments : [] });
});

// Transcript for the watch page (public). `configured` tells the owner UI
// whether "Generate transcript" can work; `status` is 'done' | 'none'.
app.get('/api/watch/:id/transcript', (req, res) => {
  const t = meta.get(req.params.id).transcript;
  const done = t && Array.isArray(t.segments) && t.segments.length;
  res.json({
    status: done ? 'done' : 'none',
    configured: transcription.isConfigured(),
    language: done ? t.language : null,
    text: done ? t.text : '',
    segments: done ? t.segments : [],
    created_at: done ? t.created_at : null,
  });
});

app.post('/api/watch/:id/react', (req, res) => {
  if (meta.get(req.params.id).audience?.reactions === false) return res.status(403).json({ error: 'Reactions are turned off for this video.' });
  const emoji = String(req.body.emoji || '').slice(0, 8);
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const t = Number(req.body.t);
  const updated = meta.update(req.params.id, m => {
    if (!Array.isArray(m.reactions)) m.reactions = [];
    m.reactions.push({ emoji, t: Number.isFinite(t) ? Math.floor(t) : null, at: Date.now() });
    return m;
  });
  res.json({ reactions: updated.reactions });
});

app.post('/api/watch/:id/comment', (req, res) => {
  if (meta.get(req.params.id).audience?.comments === false) return res.status(403).json({ error: 'Comments are turned off for this video.' });
  const text = String(req.body.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Comment text required' });
  let name = String(req.body.name || '').trim().slice(0, 80) || 'Anonymous';
  const viewer = viewerFromAuth(req);
  if (viewer) name = viewer.name;
  const comment = { id: uuidv4(), name, text, t: Number(req.body.t) || null, at: Date.now() };
  meta.update(req.params.id, m => { m.comments.push(comment); return m; });
  res.json(comment);
});

// ── Owner: analytics + share settings ────────────────────────────────────────
app.get('/api/recordings/:id/analytics', requireAuth, async (req, res) => {
  if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
  // Feature gate — analytics is Pro-only. Capability-based, not name-based.
  const user = users.findById(req.userId);
  const check = permissions.canUseAnalytics(user);
  if (!check.allowed) {
    conversion.track({ userId: user.id, userPlan: check.meta?.plan, featureRequested: conversion.TRIGGERS.ANALYTICS, meta: check.meta });
    return res.status(403).json({ error: check.reason, upgradeRequired: true, code: 'feature_locked', feature: 'analytics' });
  }
  const m = meta.get(req.params.id);
  res.json({ views: m.views, viewers: m.viewers, reactions: m.reactions, comments: m.comments });
});

app.patch('/api/recordings/:id/meta', requireAuth, async (req, res) => {
  if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
  const user = users.findById(req.userId);
  const { title, description, cta, privacy, password, folder, trimStart, trimEnd, removeBranding, segments, tags, audience, recommendedSpeed } = req.body;
  const fields = {};
  if (typeof description === 'string') fields.description = description.slice(0, 5000);

  // Tags (owner-defined).
  if (Array.isArray(tags)) {
    fields.tags = [...new Set(tags.map(t => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
  }
  // Audience controls — merge over existing so a partial update is safe.
  if (audience && typeof audience === 'object') {
    const cur = meta.get(req.params.id).audience || {};
    const next = { ...cur };
    for (const k of ['comments', 'reactions', 'download', 'transcript']) {
      if (typeof audience[k] === 'boolean') next[k] = audience[k];
    }
    fields.audience = next;
  }
  // Recommended playback speed (null = normal).
  if (recommendedSpeed === null) fields.recommendedSpeed = null;
  else if (Number.isFinite(recommendedSpeed) && recommendedSpeed >= 0.25 && recommendedSpeed <= 4) fields.recommendedSpeed = recommendedSpeed;
  if (cta === null) fields.cta = null;
  else if (cta && typeof cta.url === 'string' && cta.url) fields.cta = { label: String(cta.label || 'Learn more').slice(0, 60), url: cta.url.slice(0, 500) };

  // ── Feature gate: password-protected videos (Pro) ──────────────────────────
  const wantsPassword = privacy === 'password' || (typeof password === 'string' && password);
  if (wantsPassword) {
    const check = permissions.canUsePasswordProtectedVideos(user);
    if (!check.allowed) {
      conversion.track({ userId: user.id, userPlan: check.meta?.plan, featureRequested: conversion.TRIGGERS.PASSWORD, meta: check.meta });
      return res.status(403).json({ error: check.reason, upgradeRequired: true, code: 'feature_locked', feature: 'passwordProtection' });
    }
  }
  // ── Feature gate: remove VeoRec branding (Pro) ─────────────────────────────
  if (removeBranding === true) {
    const check = permissions.canRemoveBranding(user);
    if (!check.allowed) {
      conversion.track({ userId: user.id, userPlan: check.meta?.plan, featureRequested: conversion.TRIGGERS.REMOVE_BRANDING, meta: check.meta });
      return res.status(403).json({ error: check.reason, upgradeRequired: true, code: 'feature_locked', feature: 'removeBranding' });
    }
    fields.removeBranding = true;
  } else if (removeBranding === false) {
    fields.removeBranding = false;
  }

  if (['public', 'login', 'password'].includes(privacy)) fields.privacy = privacy;
  if (typeof password === 'string' && password) fields.passwordHash = await bcrypt.hash(password, 10);
  if (privacy && privacy !== 'password') fields.passwordHash = null;
  if (folder === null || typeof folder === 'string') fields.folder = folder;
  if (trimStart === null || Number.isFinite(trimStart)) fields.trimStart = trimStart === null ? null : Math.max(0, Math.floor(trimStart));
  if (trimEnd === null || Number.isFinite(trimEnd)) fields.trimEnd = trimEnd === null ? null : Math.floor(trimEnd);
  // Keep-segments from the editor (virtual split). Sanitize: numbers, ordered, in-range.
  if (segments === null) fields.segments = null;
  else if (Array.isArray(segments)) {
    const clean = segments
      .filter(s => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
      .map(s => ({ start: Math.max(0, +s.start), end: +s.end }))
      .sort((a, b) => a.start - b.start)
      .slice(0, 200);
    fields.segments = clean.length ? clean : null;
  }

  // Title is authoritative in meta (instant); mirror to Cloudinary context too.
  if (typeof title === 'string' && title.trim()) {
    fields.title = cleanTitle(title);
    if (USE_CLOUDINARY) {
      try {
        await cloudinary.uploader.add_context(buildContext({ title: cleanTitle(title) }),
          [`screenrec/${req.userId}/${req.params.id}`], { resource_type: 'video' });
      } catch (e) {}
    }
  }

  const updated = meta.set(req.params.id, fields);
  res.json({
    title: typeof title === 'string' ? title.trim() : undefined,
    description: updated.description, cta: updated.cta, privacy: updated.privacy,
    folder: updated.folder, hasPassword: !!updated.passwordHash,
    trimStart: updated.trimStart, trimEnd: updated.trimEnd, segments: updated.segments,
    tags: updated.tags, audience: updated.audience, recommendedSpeed: updated.recommendedSpeed,
  });
});

// ── Replace a recording's file with an edited (physically trimmed) version ────
app.post('/api/recordings/:id/replace', requireAuth, memUpload.single('video'), async (req, res) => {
  if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
  const duration = parseInt(req.body.duration) || 0;
  const sizeBytes = req.file?.size || req.file?.buffer?.length || 0;
  if (!sizeBytes) return res.status(400).json({ error: 'No video provided' });

  // Re-validate the recording-length limit on the trimmed result.
  const user = users.findById(req.userId);
  const recCheck = permissions.canRecord(user, duration);
  if (!recCheck.allowed) return res.status(403).json({ error: recCheck.reason, upgradeRequired: true, code: 'recording_limit' });

  const mode = req.body.mode === 'copy' ? 'copy' : 'overwrite';

  try {
    if (USE_CLOUDINARY) {
      if (mode === 'copy') {
        // Keep the original; upload the rendered trim as a new library video.
        const newId = uuidv4();
        let keepTitle = 'Screen recording';
        try {
          const s = await cloudinary.search.expression(`public_id=screenrec/${req.userId}/${req.params.id}`).with_field('context').max_results(1).execute();
          if (s.resources.length) keepTitle = cleanTitle(s.resources[0].context?.custom?.title) || keepTitle;
        } catch {}
        const result = await new Promise((resolve, reject) => {
          const st = cloudinary.uploader.upload_stream(
            { resource_type: 'video', public_id: `screenrec/${req.userId}/${newId}`,
              context: buildContext({ title: `${keepTitle} (trimmed)`, duration, created_at: Date.now(), rec_id: newId, user_id: req.userId, edited: 1 }) },
            (e, r) => (e ? reject(e) : resolve(r))
          );
          st.end(req.file.buffer);
        });
        usageService.updateUsage(req.userId, { bytes: result.bytes || sizeBytes, videos: 1, seconds: duration });
        return res.json({ ok: true, id: newId, mode: 'copy' });
      }
      let oldBytes = 0;
      try {
        const r = await cloudinary.search.expression(`public_id=screenrec/${req.userId}/${req.params.id}`).max_results(1).execute();
        if (r.resources.length) oldBytes = r.resources[0].bytes || 0;
      } catch {}
      const result = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream(
          { resource_type: 'video', public_id: `screenrec/${req.userId}/${req.params.id}`, overwrite: true, invalidate: true,
            context: `duration=${duration}|edited=1` },
          (e, r) => (e ? reject(e) : resolve(r))
        );
        s.end(req.file.buffer);
      });
      usageService.updateUsage(req.userId, { bytes: (result.bytes || sizeBytes) - oldBytes });
    } else {
      const row = db.get(req.params.id);
      if (row) {
        const p = path.join(__dirname, 'uploads', row.filename);
        fs.writeFileSync(p, req.file.buffer);
        usageService.updateUsage(req.userId, { bytes: sizeBytes - (row.size || 0) });
        db.update(req.params.id, { size: sizeBytes, duration });
      }
    }
    // Physical trim applied → clear virtual edits.
    meta.set(req.params.id, { segments: null, trimStart: null, trimEnd: null });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Server-side trim/split via Cloudinary (fast — no client re-encode) ────────
// Concatenates the kept segments using Cloudinary's video "splice" transform,
// bakes it into a new asset, and overwrites the original. Returns 501 when
// Cloudinary isn't configured so the client can fall back to in-browser render.
app.post('/api/recordings/:id/trim', requireAuth, async (req, res) => {
  if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
  if (!USE_CLOUDINARY) return res.status(501).json({ error: 'Server-side trim unavailable' });

  const segments = Array.isArray(req.body.segments) ? req.body.segments
    .filter(s => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .map(s => ({ start: Math.max(0, +s.start), end: +s.end }))
    .sort((a, b) => a.start - b.start) : [];
  if (!segments.length) return res.status(400).json({ error: 'No segments' });

  const user = users.findById(req.userId);
  const keptDuration = Math.round(segments.reduce((a, s) => a + (s.end - s.start), 0));
  const recCheck = permissions.canRecord(user, keptDuration);
  if (!recCheck.allowed) return res.status(403).json({ error: recCheck.reason, upgradeRequired: true, code: 'recording_limit' });

  const publicId = `screenrec/${req.userId}/${req.params.id}`;
  // Overlay public ids use ':' as the folder separator — ALL slashes must be
  // converted (the SDK only converts the first, which breaks nested folders).
  const overlayId = `video:${publicId.replace(/\//g, ':')}`;
  const r2 = (n) => Math.round(n * 100) / 100;

  // Build the splice transformation: base = first kept segment; each subsequent
  // kept segment is spliced (concatenated) onto the end.
  const transformation = [{ start_offset: r2(segments[0].start), end_offset: r2(segments[0].end) }];
  for (let i = 1; i < segments.length; i++) {
    transformation.push({ overlay: overlayId, flags: 'splice', start_offset: r2(segments[i].start), end_offset: r2(segments[i].end) });
    transformation.push({ flags: 'layer_apply' });
  }

  // Save mode: 'overwrite' replaces the original; 'copy' keeps the original and
  // adds the trimmed result as a brand-new recording in the library.
  const mode = req.body.mode === 'copy' ? 'copy' : 'overwrite';

  try {
    // The derived (transformed) URL of the current asset.
    const derivedUrl = cloudinary.url(publicId, { resource_type: 'video', transformation, secure: true, format: 'mp4' });

    // Read the original's title/created_at up front (needed for both modes).
    let oldBytes = 0, prevCtx = {};
    try {
      const s = await cloudinary.search.expression(`public_id=${publicId}`).with_field('context').max_results(1).execute();
      if (s.resources.length) { oldBytes = s.resources[0].bytes || 0; prevCtx = s.resources[0].context?.custom || {}; }
    } catch {}
    const keepTitle = cleanTitle(prevCtx.title) || 'Screen recording';
    const createdAt = prevCtx.created_at || Date.now();

    if (mode === 'copy') {
      // Bake the trim into a NEW asset; leave the original untouched.
      const newId = uuidv4();
      const newPublicId = `screenrec/${req.userId}/${newId}`;
      const uploaded = await cloudinary.uploader.upload(derivedUrl, {
        resource_type: 'video', public_id: newPublicId,
        context: buildContext({ title: `${keepTitle} (trimmed)`, duration: keptDuration, created_at: Date.now(), rec_id: newId, user_id: req.userId, edited: 1 }),
      });
      usageService.updateUsage(req.userId, { bytes: uploaded.bytes || 0, videos: 1, seconds: keptDuration });
      return res.json({ ok: true, id: newId, mode: 'copy', duration: keptDuration });
    }

    // Overwrite: bake to a temp asset, then atomically swap it in via rename
    // (overwrite:true). No destroy-first — that left a window where a rename
    // failure would lose the video entirely.
    const tmpId = `${publicId}__trim_${Date.now()}`;
    const uploaded = await cloudinary.uploader.upload(derivedUrl, {
      resource_type: 'video', public_id: tmpId, overwrite: true,
    });
    await cloudinary.uploader.rename(tmpId, publicId, { resource_type: 'video', overwrite: true, invalidate: true });
    // Preserve title + metadata on the new (trimmed) asset (don't lose the name).
    try {
      await cloudinary.uploader.add_context(
        buildContext({ title: keepTitle, duration: keptDuration, created_at: createdAt, rec_id: req.params.id, user_id: req.userId, edited: 1 }),
        [publicId], { resource_type: 'video' });
    } catch {}

    usageService.updateUsage(req.userId, { bytes: (uploaded.bytes || 0) - oldBytes });
    meta.set(req.params.id, { segments: null, trimStart: null, trimEnd: null });
    res.json({ ok: true, mode: 'overwrite', duration: keptDuration });
  } catch (e) {
    console.error('[trim] failed:', e.message);
    res.status(500).json({ error: e.message || 'Trim failed' });
  }
});

// ── Transcription (owner generates; Whisper via Groq free tier) ───────────────
app.post('/api/recordings/:id/transcribe', requireAuth, async (req, res) => {
  if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
  // Pro feature gate (capability-based, enforced server-side).
  const tCheck = permissions.canUseTranscription(users.findById(req.userId));
  if (!tCheck.allowed) {
    conversion.track({ userId: req.userId, userPlan: tCheck.meta?.plan, featureRequested: 'transcription', meta: tCheck.meta });
    return res.status(403).json({ error: tCheck.reason, upgradeRequired: true, code: 'feature_locked', feature: 'transcription' });
  }
  if (!transcription.isConfigured()) {
    return res.status(501).json({ error: 'Transcription is not available on this server yet.', code: 'transcription_unconfigured' });
  }
  try {
    let audioUrl;
    if (USE_CLOUDINARY) {
      // Cloudinary derives a small mp3 audio track from the video on the fly;
      // whisper.cpp (self-hosted) then transcribes it server-side.
      audioUrl = cloudinary.url(`screenrec/${req.userId}/${req.params.id}`, { resource_type: 'video', format: 'mp3', secure: true });
    } else {
      const row = db.get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      audioUrl = `${req.protocol}://${req.get('host')}/uploads/${row.filename}`;
    }

    const result = await transcription.transcribeUrl(audioUrl);
    if (!result.segments.length) return res.status(422).json({ error: 'No speech detected in this recording.' });

    meta.set(req.params.id, { transcript: { ...result, status: 'done', created_at: Date.now() } });
    res.json({ status: 'done', ...result });
  } catch (e) {
    const code = e.code === 'too_large' ? 413 : 500;
    console.error('[transcribe] failed:', e.message);
    res.status(code).json({ error: e.message || 'Transcription failed' });
  }
});

// Owner can clear/regenerate
app.delete('/api/recordings/:id/transcribe', requireAuth, async (req, res) => {
  if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
  meta.set(req.params.id, { transcript: null });
  res.json({ ok: true });
});

// ── Folders (owner) ───────────────────────────────────────────────────────────
app.get('/api/folders', requireAuth, (req, res) => res.json(folders.listByUser(req.userId)));
app.post('/api/folders', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Folder name required' });
  res.json(folders.create({ id: uuidv4(), userId: req.userId, name, created_at: Date.now() }));
});
app.patch('/api/folders/:id', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Folder name required' });
  const updated = folders.update(req.params.id, req.userId, { name });
  if (!updated) return res.status(404).json({ error: 'Folder not found' });
  res.json(updated);
});
app.delete('/api/folders/:id', requireAuth, (req, res) => {
  folders.remove(req.params.id, req.userId);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// MONETIZATION API
// ══════════════════════════════════════════════════════════════════════════════

// ── Plans & entitlements (read) ───────────────────────────────────────────────
// Public pricing data (capability-based; no internal ids leak).
app.get('/api/plans', (req, res) => {
  res.json({ plans: plans.listPublicPlans().map(plans.publicPlan) });
});

// The current user's effective plan + capabilities (UI render only; gates are
// still enforced server-side on every premium endpoint).
app.get('/api/me/entitlements', requireAuth, (req, res) => {
  const u = users.findById(req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(entitlements.summary(u));
});

// The current user's usage vs their plan limits (drives StorageMeter/UsageMeter).
app.get('/api/me/usage', requireAuth, (req, res) => {
  const u = users.findById(req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const plan = entitlements.resolve(u);
  res.json(usageService.getUsageSummary(u.id, plan));
});

// ── Billing config (frontend Paddle.js bootstrap) ─────────────────────────────
app.get('/api/billing/config', (req, res) => {
  res.json({
    provider: 'paddle',
    enabled: billingConfig.isBillingEnabled(),
    clientToken: billingConfig.PADDLE.clientToken || null,
    env: billingConfig.PADDLE.environment,
    prices: {
      proMonthly: billingConfig.getPriceId('pro', 'monthly'),
      proYearly: billingConfig.getPriceId('pro', 'yearly'),
    },
  });
});

// ── Checkout + subscription management (billing.service) ──────────────────────
app.post('/api/billing/checkout', requireAuth, (req, res) => {
  const u = users.findById(req.userId);
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const result = billingService.createCheckout(u, billingCycle, 'pro');
  if (!result.ok) return res.status(400).json({ error: result.error });
  conversion.track({ userId: u.id, userPlan: entitlements.resolveSlug(u), featureRequested: conversion.TRIGGERS.CHECKOUT_OPEN, meta: { billingCycle } });
  res.json(result.checkout);
});

app.get('/api/billing/subscription', requireAuth, async (req, res) => {
  const u = users.findById(req.userId);
  const result = await billingService.getSubscription(u);
  res.json(result);
});

app.post('/api/billing/sync', requireAuth, async (req, res) => {
  const u = users.findById(req.userId);
  const result = await billingService.syncSubscription(u);
  res.json(result);
});

app.post('/api/billing/cancel', requireAuth, async (req, res) => {
  const u = users.findById(req.userId);
  const result = await billingService.cancelSubscription(u);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true });
});

app.post('/api/billing/resume', requireAuth, async (req, res) => {
  const u = users.findById(req.userId);
  const result = await billingService.resumeSubscription(u);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true });
});

app.post('/api/billing/change-plan', requireAuth, async (req, res) => {
  const u = users.findById(req.userId);
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const result = await billingService.changePlan(u, billingCycle, req.body.planSlug || 'pro');
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true });
});

app.get('/api/billing/portal', requireAuth, async (req, res) => {
  const u = users.findById(req.userId);
  const result = await billingService.getCustomerPortal(u);
  if (!result.ok) return res.status(400).json(result);
  res.json({ url: result.url });
});

// ── Conversion tracking (frontend reports paywall impressions) ────────────────
app.post('/api/events/upgrade-intent', requireAuth, (req, res) => {
  const u = users.findById(req.userId);
  const feature = String(req.body.featureRequested || 'unknown').slice(0, 64);
  conversion.track({ userId: u.id, userPlan: entitlements.resolveSlug(u), featureRequested: feature, meta: req.body.meta || {} });
  res.json({ ok: true });
});

// ── Webhooks (canonical path + legacy alias) ──────────────────────────────────
const paddleWebhookHandler = makePaddleWebhook({ users });
app.post('/api/webhooks/paddle', paddleWebhookHandler);
app.post('/api/billing/paddle/webhook', paddleWebhookHandler); // back-compat

// ── Contact form (public) ─────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 120);
  const email = String(req.body.email || '').trim().slice(0, 200);
  const subject = String(req.body.subject || '').trim().slice(0, 160);
  const message = String(req.body.message || '').trim().slice(0, 5000);
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email' });

  const viewer = viewerFromAuth(req);
  const saved = contacts.create({ name, email, subject, message, userId: viewer?.id });

  // Best-effort email notification to the owner (uses existing Brevo helper).
  const to = (process.env.ADMIN_EMAILS || '').split(',')[0].trim();
  if (to) {
    sendEmail(to, `New VeoRec contact: ${subject || 'No subject'}`,
      `<div style="font-family:sans-serif"><h3>New contact message</h3>
       <p><b>From:</b> ${name} &lt;${email}&gt;</p>
       <p><b>Subject:</b> ${subject || '(none)'}</p>
       <p><b>Message:</b></p><p style="white-space:pre-wrap">${message.replace(/</g, '&lt;')}</p></div>`)
      .catch(() => {});
  }
  res.json({ ok: true, id: saved.id });
});

// ── Admin dashboard metrics ───────────────────────────────────────────────────
app.get('/api/admin/metrics', requireAuth, requireAdmin, (req, res) => {
  res.json({ ...buildAdminMetrics(), newContacts: contacts.countNew() });
});

// ── Admin: users (list, with plan/usage/subscription) ─────────────────────────
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const rows = loadAllUsers()
    .filter((u) => !q || (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q))
    .map((u) => {
      const ent = entitlements.summary(u);
      const usg = usageService.get(u.id);
      const sub = subscriptions.getByUser(u.id);
      return {
        id: u.id, name: u.name, email: u.email,
        createdAt: u.created_at,
        authProvider: u.googleId ? 'google' : (u.password ? 'password' : 'other'),
        planSlug: ent.planSlug, source: ent.source, comped: ent.comped,
        manualPlan: u.manualPlan || null, manualPlanExpires: u.manualPlanExpires || null,
        subscriptionStatus: sub?.status || null,
        billingCycle: sub?.billingCycle || null,
        storageUsedBytes: usg.storageUsedBytes || 0,
        videoCount: usg.videoCount || 0,
        isAdmin: isAdmin(u),
      };
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ users: rows, total: rows.length });
});

// ── Admin: grant / revoke a plan for a user (comp premium, no payment) ────────
app.patch('/api/admin/users/:id/plan', requireAuth, requireAdmin, (req, res) => {
  const target = users.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const { planSlug, days } = req.body;

  if (planSlug === null || planSlug === 'free') {
    // Revoke comp — fall back to their real subscription/free.
    users.update(target.id, { manualPlan: null, manualPlanExpires: null });
  } else {
    if (!plans.getPlan(planSlug) || plans.getPlan(planSlug).slug !== String(planSlug).toLowerCase()) {
      return res.status(400).json({ error: 'Unknown plan' });
    }
    const expires = days && Number(days) > 0 ? Date.now() + Number(days) * 86400000 : null;
    users.update(target.id, { manualPlan: planSlug, manualPlanExpires: expires });
  }
  const updated = users.findById(target.id);
  res.json({ ok: true, entitlements: entitlements.summary(updated) });
});

// ── Admin: create / invite a user ─────────────────────────────────────────────
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 120);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
  const password = req.body.password ? String(req.body.password) : '';
  const planSlug = req.body.planSlug || null;
  const sendInvite = req.body.sendInvite !== false; // default: send invite link
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (users.findByEmail(email)) return res.status(409).json({ error: 'A user with that email already exists' });
  if (password && password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const user = {
    id: uuidv4(), name, email,
    password: password ? await bcrypt.hash(password, 10) : null,
    plan: 'free', created_at: Date.now(),
  };
  // Optional comp grant on creation.
  if (planSlug && planSlug !== 'free' && plans.getPlan(planSlug).slug === String(planSlug).toLowerCase()) {
    user.manualPlan = planSlug;
  }
  // Invite flow: set a reset token and email a "set your password" link.
  let invited = false;
  if (!password && sendInvite) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetExpires = Date.now() + 7 * 24 * 3600 * 1000; // 7-day invite window
    const base = process.env.CLIENT_URL || 'https://veorec.com';
    const link = `${base}/reset?token=${token}&email=${encodeURIComponent(email)}`;
    invited = await sendEmail(email, 'You’re invited to VeoRec',
      `<div style="font-family:sans-serif"><h2>Welcome to VeoRec, ${name}!</h2><p>An account has been created for you. Click below to set your password and get started.</p><p><a href="${link}" style="display:inline-block;background:#5b5bf6;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Set your password</a></p><p style="color:#888;font-size:12px">Or paste this link: ${link}</p><p style="color:#888;font-size:12px">This invite expires in 7 days.</p></div>`);
  }
  users.create(user);
  res.json({ ok: true, user: publicUser(user), invited });
});

// ── Admin: delete a user ──────────────────────────────────────────────────────
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const target = users.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (isAdmin(target)) return res.status(403).json({ error: 'Cannot delete another admin' });
  users.remove(target.id);
  subscriptions.remove(target.id);
  res.json({ ok: true });
});

// ── Admin: plans (view + edit pricing/limits/features at runtime) ─────────────
app.get('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
  res.json({ plans: plans.listAllPlans() });
});

app.patch('/api/admin/plans/:slug', requireAuth, requireAdmin, (req, res) => {
  const updated = plans.setPlanOverride(req.params.slug, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Unknown plan' });
  res.json({ ok: true, plan: updated });
});

app.delete('/api/admin/plans/:slug/override', requireAuth, requireAdmin, (req, res) => {
  res.json({ ok: true, plan: plans.clearPlanOverride(req.params.slug) });
});

// ── Admin: contact submissions ────────────────────────────────────────────────
app.get('/api/admin/contacts', requireAuth, requireAdmin, (req, res) => {
  res.json({ contacts: contacts.all() });
});
app.patch('/api/admin/contacts/:id', requireAuth, requireAdmin, (req, res) => {
  const status = ['new', 'read', 'replied', 'archived'].includes(req.body.status) ? req.body.status : 'read';
  res.json({ ok: true, contact: contacts.setStatus(req.params.id, status) });
});

function loadAllUsers() {
  // users.js has no list(); read the file directly via the same store path.
  try {
    const fsx = require('fs'); const px = require('path');
    const dir = process.env.DATA_DIR || __dirname;
    const f = px.join(dir, 'users.json');
    return fsx.existsSync(f) ? JSON.parse(fsx.readFileSync(f, 'utf8')) : [];
  } catch { return []; }
}

function buildAdminMetrics() {
  const all = loadAllUsers();
  const subs = subscriptions.all();
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  const paidSubs = subs.filter((s) => subscriptions.isEntitled(s));
  const paidUserIds = new Set(paidSubs.map((s) => s.userId));
  const freeUsers = all.filter((u) => !paidUserIds.has(u.id));

  // MRR: normalize annual to monthly.
  let mrr = 0;
  for (const s of paidSubs) {
    const plan = plans.getPlan(s.planSlug);
    if (s.billingCycle === 'yearly') mrr += (plan.yearlyPrice || 0) / 12;
    else mrr += plan.monthlyPrice || 0;
  }

  // Usage rollups.
  let storageConsumed = 0, videosUploaded = 0;
  for (const u of all) {
    const usg = usageService.get(u.id);
    storageConsumed += usg.storageUsedBytes || 0;
    videosUploaded += usg.videoCount || 0;
  }

  const canceled = subs.filter((s) => s.status === 'canceled').length;
  const churnRate = subs.length ? +((canceled / subs.length) * 100).toFixed(1) : 0;
  const upgradeRate = all.length ? +((paidUserIds.size / all.length) * 100).toFixed(1) : 0;

  const topStorage = all
    .map((u) => ({ id: u.id, email: u.email, bytes: usageService.get(u.id).storageUsedBytes || 0 }))
    .sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  const mostActive = all
    .map((u) => ({ id: u.id, email: u.email, videos: usageService.get(u.id).videoCount || 0 }))
    .sort((a, b) => b.videos - a.videos).slice(0, 10);

  return {
    totalUsers: all.length,
    activeUsers: all.filter((u) => (now - (u.plan_since || u.created_at || 0)) < THIRTY_DAYS).length,
    freeUsers: freeUsers.length,
    paidUsers: paidUserIds.size,
    mrr: +mrr.toFixed(2),
    annualRevenue: +(mrr * 12).toFixed(2),
    videosUploaded,
    storageConsumedGB: +(storageConsumed / (1024 ** 3)).toFixed(2),
    upgradeRate,
    churnRate,
    conversionEvents: conversion.summarize(now - THIRTY_DAYS),
    topStorageUsers: topStorage,
    mostActiveUsers: mostActive,
  };
}

// ── Background jobs (usage + subscription reconciliation) ──────────────────────
async function listUserVideos(userId) {
  if (!USE_CLOUDINARY) {
    return db.all().filter((r) => r.userId === userId).map((r) => ({ sizeBytes: r.size, durationSeconds: r.duration }));
  }
  try {
    const result = await cloudinary.search
      .expression(`folder:screenrec/${userId} AND resource_type:video`)
      .max_results(500).execute();
    return result.resources.map((r) => ({ sizeBytes: r.bytes, durationSeconds: Math.round(r.duration || 0) }));
  } catch { return []; }
}

cron.start({ listUsers: loadAllUsers, listVideos: listUserVideos });

// ── Serve client build ────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`Server :${PORT} | Cloudinary: ${USE_CLOUDINARY}`));
