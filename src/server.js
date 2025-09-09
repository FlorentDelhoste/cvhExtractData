import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fsp from 'fs/promises';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');

// Increase body size to handle large saved files
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, message: 'Server is up' });
});

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

// Save last state (files + filters)
// POST /api/save-state
// Body: {
//   files: { file1?: { name, content }, file2?: { name, content } },
//   filters?: { eventName?: string, institutionOid?: string }
// }
app.post('/api/save-state', async (req, res) => {
  const { files = {}, filters = {} } = req.body || {};
  try {
    await ensureDataDir();
    const writes = [];
    const meta = { savedAt: new Date().toISOString(), filters: {} };
    if (files.file1 && typeof files.file1.content === 'string') {
      writes.push(fsp.writeFile(path.join(DATA_DIR, 'file1.txt'), files.file1.content, 'utf8'));
      meta.file1Name = String(files.file1.name || 'file1');
    }
    if (files.file2 && typeof files.file2.content === 'string') {
      writes.push(fsp.writeFile(path.join(DATA_DIR, 'file2.txt'), files.file2.content, 'utf8'));
      meta.file2Name = String(files.file2.name || 'file2');
    }
    meta.filters = {
      eventName: typeof filters.eventName === 'string' ? filters.eventName : '',
      institutionOid: typeof filters.institutionOid === 'string' ? filters.institutionOid : ''
    };
    writes.push(fsp.writeFile(path.join(DATA_DIR, 'config.json'), JSON.stringify(meta, null, 2), 'utf8'));
    await Promise.all(writes);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Load last state
// GET /api/last-state -> { files: { file1?: {name, content}, file2?: {name, content} }, filters }
app.get('/api/last-state', async (req, res) => {
  try {
    const cfgPath = path.join(DATA_DIR, 'config.json');
    if (!fs.existsSync(cfgPath)) return res.json({ ok: true, files: {}, filters: {} });
    const cfg = JSON.parse(await fsp.readFile(cfgPath, 'utf8'));
    const out = { files: {}, filters: cfg.filters || {} };
    const f1Path = path.join(DATA_DIR, 'file1.txt');
    const f2Path = path.join(DATA_DIR, 'file2.txt');
    if (fs.existsSync(f1Path)) {
      out.files.file1 = { name: cfg.file1Name || 'file1', content: await fsp.readFile(f1Path, 'utf8') };
    }
    if (fs.existsSync(f2Path)) {
      out.files.file2 = { name: cfg.file2Name || 'file2', content: await fsp.readFile(f2Path, 'utf8') };
    }
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`App running on http://localhost:${PORT}`);
});
