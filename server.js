require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DB_PATH = process.env.DB_PATH || './urls.db';

// --- Database setup ---
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code  TEXT    UNIQUE NOT NULL,
    original_url TEXT   NOT NULL,
    created_at  TEXT   DEFAULT (datetime('now')),
    click_count INTEGER DEFAULT 0
  )
`);

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---
function generateCode() {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6);
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// --- Routes ---

// POST /api/shorten — create a short link
app.post('/api/shorten', (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL — must start with http:// or https://' });
  }

  const insert = db.prepare('INSERT INTO urls (short_code, original_url) VALUES (?, ?)');

  let code;
  for (let i = 0; i < 10; i++) {
    code = generateCode();
    try {
      insert.run(code, url);
      break;
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) continue;
      throw e;
    }
    code = null;
  }

  if (!code) {
    return res.status(500).json({ error: 'Could not generate a unique short code, please retry' });
  }

  res.json({
    short_code: code,
    short_url: `${BASE_URL}/${code}`,
    original_url: url,
  });
});

// GET /api/links — list all links with click counts
app.get('/api/links', (req, res) => {
  const rows = db.prepare('SELECT * FROM urls ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({ ...r, short_url: `${BASE_URL}/${r.short_code}` })));
});

// GET /:code — redirect and log click
app.get('/:code', (req, res) => {
  const { code } = req.params;

  // Guard: don't intercept API or static asset paths
  if (code.includes('.') || code === 'api') {
    return res.status(404).send('Not found');
  }

  const row = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(code);
  if (!row) {
    return res.status(404).send(`
      <h2>Short link not found</h2>
      <p><a href="/">Back to URL Shortener</a></p>
    `);
  }

  db.prepare('UPDATE urls SET click_count = click_count + 1 WHERE short_code = ?').run(code);
  res.redirect(302, row.original_url);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`URL Shortener running at ${BASE_URL}`);
});
