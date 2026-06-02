const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./db');
const users = require('./users');
const { meta, folders } = require('./meta');
const { signToken, requireAuth, verifyToken } = require('./auth');

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
        const id = ctx.rec_id || r.public_id.split('/').pop();
        const m = meta.get(id);
        return {
          id,
          title: ctx.title || 'Untitled Recording',
          filename: r.secure_url,
          // Cloudinary-generated poster image (fast thumbnail, no full video load)
          thumbnail: r.secure_url.replace(/\.webm$/, '.jpg').replace('/upload/', '/upload/so_0/'),
          size: r.bytes,
          // Prefer Cloudinary's own measured duration (reliable) over our stored value
          duration: Math.round(r.duration || parseInt(ctx.duration) || 0),
          created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
          cloudinary: true,
          public_id: r.public_id,
          views: m.views,
          description: m.description,
          privacy: m.privacy,
          cta: m.cta,
          folder: m.folder,
          commentCount: m.comments.length,
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
      meta.remove(req.params.id);
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
      thumbnail: r.secure_url.replace(/\.webm$/, '.jpg').replace('/upload/', '/upload/so_0/'),
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
      return res.status(401).json({ error: 'login_required', title: video.title });
    }
    if (m.privacy === 'password' && m.passwordHash) {
      return res.json({ id: video.id, title: video.title, requiresPassword: true });
    }
    res.json({ ...video, description: m.description, cta: m.cta, privacy: m.privacy });
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
    res.json({ ...video, description: m.description, cta: m.cta, privacy: m.privacy });
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

app.get('/api/watch/:id/engagement', (req, res) => {
  const m = meta.get(req.params.id);
  res.json({ views: m.views, reactions: m.reactions, comments: m.comments });
});

app.post('/api/watch/:id/react', (req, res) => {
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
  const m = meta.get(req.params.id);
  res.json({ views: m.views, viewers: m.viewers, reactions: m.reactions, comments: m.comments });
});

app.patch('/api/recordings/:id/meta', requireAuth, async (req, res) => {
  if (!(await userOwns(req.userId, req.params.id))) return res.status(404).json({ error: 'Not found' });
  const { description, cta, privacy, password, folder } = req.body;
  const fields = {};
  if (typeof description === 'string') fields.description = description.slice(0, 5000);
  if (cta === null) fields.cta = null;
  else if (cta && typeof cta.url === 'string' && cta.url) fields.cta = { label: String(cta.label || 'Learn more').slice(0, 60), url: cta.url.slice(0, 500) };
  if (['public', 'login', 'password'].includes(privacy)) fields.privacy = privacy;
  if (typeof password === 'string' && password) fields.passwordHash = await bcrypt.hash(password, 10);
  if (privacy && privacy !== 'password') fields.passwordHash = null;
  if (folder === null || typeof folder === 'string') fields.folder = folder;
  const updated = meta.set(req.params.id, fields);
  res.json({
    description: updated.description, cta: updated.cta, privacy: updated.privacy,
    folder: updated.folder, hasPassword: !!updated.passwordHash,
  });
});

// ── Folders (owner) ───────────────────────────────────────────────────────────
app.get('/api/folders', requireAuth, (req, res) => res.json(folders.listByUser(req.userId)));
app.post('/api/folders', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Folder name required' });
  res.json(folders.create({ id: uuidv4(), userId: req.userId, name, created_at: Date.now() }));
});
app.delete('/api/folders/:id', requireAuth, (req, res) => {
  folders.remove(req.params.id, req.userId);
  res.json({ success: true });
});

// ── Serve client build ────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`Server :${PORT} | Cloudinary: ${USE_CLOUDINARY}`));
