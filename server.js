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
  );
  CREATE TABLE IF NOT EXISTS clicks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id     INTEGER NOT NULL REFERENCES urls(id),
    clicked_at TEXT    DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_clicks_url_date ON clicks (url_id, clicked_at);
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

// GET /api/links/:code/stats — per-day click breakdown for a single link
app.get('/api/links/:code/stats', (req, res) => {
  const row = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Link not found' });

  const rawByDay = db.prepare(`
    SELECT date(clicked_at) AS day, COUNT(*) AS count
    FROM clicks
    WHERE url_id = ? AND date(clicked_at) >= date('now', '-6 days')
    GROUP BY date(clicked_at)
    ORDER BY day ASC
  `).all(row.id);

  // Build a full 7-day array with zeros for days that had no clicks
  const byDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const label = d.toISOString().slice(0, 10);
    const found = rawByDay.find(r => r.day === label);
    byDay.push({ day: label, count: found ? found.count : 0 });
  }

  res.json({
    short_code: row.short_code,
    short_url: `${BASE_URL}/${row.short_code}`,
    original_url: row.original_url,
    total_clicks: row.click_count,
    created_at: row.created_at,
    clicks_by_day: byDay,
  });
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

  db.transaction(() => {
    db.prepare('UPDATE urls SET click_count = click_count + 1 WHERE short_code = ?').run(code);
    db.prepare('INSERT INTO clicks (url_id) VALUES (?)').run(row.id);
  })();
  res.redirect(302, row.original_url);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`URL Shortener running at ${BASE_URL}`);
});
