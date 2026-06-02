const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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

if (!USE_CLOUDINARY) {
  const db = require('./db');
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `${uuidv4()}.webm`),
  });
  const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });
  app.use('/uploads', express.static(uploadDir));

  // ── LOCAL DEV ROUTES ──────────────────────────────────────────────────────
  app.post('/api/upload', upload.single('video'), (req, res) => {
    const { title, duration } = req.body;
    const id = uuidv4();
    db.insert({ id, title: title || 'Untitled Recording', filename: req.file.filename,
      size: req.file.size, duration: parseInt(duration) || 0, created_at: Date.now() });
    res.json({ id, url: `http://localhost:${PORT}/watch/${id}` });
  });

  app.get('/api/recordings', (req, res) => res.json(db.all()));
  app.get('/api/recordings/:id', (req, res) => {
    const row = db.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
  app.delete('/api/recordings/:id', (req, res) => {
    const row = db.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const p = path.join(uploadDir, row.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    db.delete(req.params.id);
    res.json({ success: true });
  });
  app.patch('/api/recordings/:id', (req, res) => {
    db.update(req.params.id, { title: req.body.title });
    res.json({ success: true });
  });

} else {
  // ── PRODUCTION CLOUDINARY ROUTES ──────────────────────────────────────────
  // Buffer upload in memory then stream to Cloudinary
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

  app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
      const { title, duration } = req.body;
      const id = uuidv4();
      const recTitle = title || 'Untitled Recording';

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'screenrec',
            public_id: id,
            context: `title=${recTitle}|duration=${duration || 0}|created_at=${Date.now()}|rec_id=${id}`,
          },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file.buffer);
      });

      const base = process.env.PUBLIC_URL || `https://${req.get('host')}`;
      res.json({ id, url: `${base}/watch/${id}` });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/recordings', async (req, res) => {
    try {
      const result = await cloudinary.search
        .expression('folder:screenrec AND resource_type:video')
        .with_field('context')
        .sort_by('created_at', 'desc')
        .max_results(100)
        .execute();

      const rows = result.resources.map(r => {
        const ctx = r.context?.custom || {};
        return {
          id: ctx.rec_id || r.public_id.replace('screenrec/', ''),
          title: ctx.title || 'Untitled Recording',
          filename: r.secure_url,
          size: r.bytes,
          duration: parseInt(ctx.duration) || 0,
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

  app.get('/api/recordings/:id', async (req, res) => {
    try {
      const r = await cloudinary.api.resource(`screenrec/${req.params.id}`, {
        resource_type: 'video', context: true
      });
      const ctx = r.context?.custom || {};
      res.json({
        id: req.params.id,
        title: ctx.title || 'Untitled Recording',
        filename: r.secure_url,
        size: r.bytes,
        duration: parseInt(ctx.duration) || 0,
        created_at: parseInt(ctx.created_at) || new Date(r.created_at).getTime(),
        cloudinary: true,
        public_id: r.public_id,
      });
    } catch (e) {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.delete('/api/recordings/:id', async (req, res) => {
    try {
      await cloudinary.uploader.destroy(`screenrec/${req.params.id}`, { resource_type: 'video' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/recordings/:id', async (req, res) => {
    try {
      await cloudinary.uploader.add_context(
        `title=${req.body.title}`,
        [`screenrec/${req.params.id}`],
        { resource_type: 'video' }
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

// ── Serve client build ────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`Server on :${PORT} | Cloudinary: ${USE_CLOUDINARY}`));
