const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./db');
const users = require('./users');
const { signToken, requireAuth } = require('./auth');

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
app.use(express.json());

// ── Auth Routes (public) ─────────────────────────────────────────────────────
// Serialize a user for client responses — never includes the password hash.
function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.plan || 'free',
    created_at: u.created_at,
  };
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
    db.insert({ id, userId: req.userId, title: title || 'Untitled Recording',
      filename: req.file.filename, size: req.file.size,
      duration: parseInt(duration) || 0, created_at: Date.now() });
    const base = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    res.json({ id, url: `${base}/watch/${id}` });
  });

  app.get('/api/recordings', requireAuth, (req, res) => {
    res.json(db.all().filter(r => r.userId === req.userId));
  });

  app.get('/api/recordings/:id', requireAuth, (req, res) => {
    const row = db.get(req.params.id);
    if (!row || row.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  app.delete('/api/recordings/:id', requireAuth, (req, res) => {
    const row = db.get(req.params.id);
    if (!row || row.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    const p = path.join(__dirname, 'uploads', row.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    db.delete(req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/recordings/:id', requireAuth, (req, res) => {
    const row = db.get(req.params.id);
    if (!row || row.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    db.update(req.params.id, { title: req.body.title });
    res.json({ success: true });
  });

} else {
  // ── Cloudinary routes ──────────────────────────────────────────────────────
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

  app.post('/api/upload', requireAuth, upload.single('video'), async (req, res) => {
    try {
      const { title, duration } = req.body;
      const id = uuidv4();
      const recTitle = title || 'Untitled Recording';

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
      const result = await cloudinary.search
        .expression(`folder:screenrec/${req.userId} AND resource_type:video`)
        .with_field('context')
        .sort_by('created_at', 'desc')
        .max_results(200)
        .execute();

      const rows = result.resources.map(r => {
        const ctx = r.context?.custom || {};
        return {
          id: ctx.rec_id || r.public_id.split('/').pop(),
          title: ctx.title || 'Untitled Recording',
          filename: r.secure_url,
          size: r.bytes,
          // Prefer Cloudinary's own measured duration (reliable) over our stored value
          duration: Math.round(r.duration || parseInt(ctx.duration) || 0),
          created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
          cloudinary: true,
          public_id: r.public_id,
        };
      });
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/recordings/:id', requireAuth, async (req, res) => {
    try {
      // Search across user's folder
      const result = await cloudinary.search
        .expression(`folder:screenrec/${req.userId} AND resource_type:video AND public_id:screenrec/${req.userId}/${req.params.id}`)
        .with_field('context')
        .max_results(1)
        .execute();

      if (!result.resources.length) return res.status(404).json({ error: 'Not found' });
      const r = result.resources[0];
      const ctx = r.context?.custom || {};
      res.json({
        id: req.params.id,
        title: ctx.title || 'Untitled Recording',
        filename: r.secure_url,
        size: r.bytes,
        duration: Math.round(r.duration || parseInt(ctx.duration) || 0),
        created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
        cloudinary: true,
        public_id: r.public_id,
      });
    } catch (e) {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.delete('/api/recordings/:id', requireAuth, async (req, res) => {
    try {
      await cloudinary.uploader.destroy(`screenrec/${req.userId}/${req.params.id}`, { resource_type: 'video' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/recordings/:id', requireAuth, async (req, res) => {
    try {
      await cloudinary.uploader.add_context(
        `title=${req.body.title}`,
        [`screenrec/${req.userId}/${req.params.id}`],
        { resource_type: 'video' }
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

// ── Watch route: public (anyone with the link can view) ──────────────────────
// The video URL itself requires no auth — only the API listing does
app.get('/api/watch/:id', async (req, res) => {
  // Return video info publicly (for the shared watch page)
  if (USE_CLOUDINARY) {
    try {
      // Match by the rec_id context field (exact) — works for both old
      // flat paths (screenrec/<id>) and new per-user paths (screenrec/<userId>/<id>).
      let result = await cloudinary.search
        .expression(`resource_type:video AND context.rec_id=${req.params.id}`)
        .with_field('context')
        .max_results(1)
        .execute();
      // Fallback: legacy recordings stored with public_id == id, no rec_id context
      if (!result.resources.length) {
        result = await cloudinary.search
          .expression(`resource_type:video AND public_id=screenrec/${req.params.id}`)
          .with_field('context')
          .max_results(1)
          .execute();
      }
      if (!result.resources.length) return res.status(404).json({ error: 'Not found' });
      const r = result.resources[0];
      const ctx = r.context?.custom || {};
      res.json({
        id: req.params.id,
        title: ctx.title || 'Untitled Recording',
        filename: r.secure_url,
        size: r.bytes,
        duration: Math.round(r.duration || parseInt(ctx.duration) || 0),
        created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
        cloudinary: true,
      });
    } catch (e) {
      res.status(404).json({ error: 'Not found' });
    }
  } else {
    const row = db.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }
});

// ── Serve client build ────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`Server :${PORT} | Cloudinary: ${USE_CLOUDINARY}`));
