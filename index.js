const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  host: 'pqsql-ftools-prod-resources-k8s.privatelink.postgres.database.azure.com',
  port: 6432,
  database: 'production_resource_wdvfwpqjtrpxosypgs',
  user: 'service_resource_wdvfwpqjtrpxosypgs',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

let dbReady = false;

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT, title TEXT, company TEXT, email TEXT, phone TEXT,
      linkedin TEXT, category TEXT, status TEXT,
      last_meeting TEXT, next_meeting TEXT, notes TEXT, city TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT`);
  dbReady = true;
  console.log('Database ready');
}

app.get('/health', (req, res) => res.json({ ok: true, db: dbReady }));

app.get('/api/contacts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts ORDER BY created_at ASC');
    res.json(result.rows.map(r => ({
      id: r.id, name: r.name, title: r.title, company: r.company, email: r.email,
      phone: r.phone, linkedin: r.linkedin, category: r.category,
      status: r.status, lastMeeting: r.last_meeting,
      nextMeeting: r.next_meeting, notes: r.notes, city: r.city
    })));
  } catch(e) {
    console.error('GET /api/contacts error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Upsert a single contact (add or update)
app.post('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  const c = req.body;
  try {
    await pool.query(
      `INSERT INTO contacts (id,name,title,company,email,phone,linkedin,category,status,last_meeting,next_meeting,notes,city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         name=$2,title=$3,company=$4,email=$5,phone=$6,linkedin=$7,
         category=$8,status=$9,last_meeting=$10,next_meeting=$11,notes=$12,city=$13`,
      [id,c.name,c.title||null,c.company,c.email,c.phone,c.linkedin,c.category,c.status,c.lastMeeting,c.nextMeeting,c.notes,c.city||null]
    );
    res.json({ success: true });
  } catch(e) {
    console.error('POST /api/contacts/:id error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Delete a single contact
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contacts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) {
    console.error('DELETE /api/contacts/:id error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Legacy bulk endpoint kept for compatibility but now uses upsert (no delete)
app.post('/api/contacts', async (req, res) => {
  const contacts = req.body;
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'Expected array' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of contacts) {
      await client.query(
        `INSERT INTO contacts (id,name,title,company,email,phone,linkedin,category,status,last_meeting,next_meeting,notes,city)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           name=$2,title=$3,company=$4,email=$5,phone=$6,linkedin=$7,
           category=$8,status=$9,last_meeting=$10,next_meeting=$11,notes=$12,city=$13`,
        [c.id,c.name,c.title||null,c.company,c.email,c.phone,c.linkedin,c.category,c.status,c.lastMeeting,c.nextMeeting,c.notes,c.city||null]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('POST /api/contacts error:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;

// Font proxy for Roughwell (served from flow.life CDN, no CORS headers)
app.get('/fonts/roughwell.woff2', async (req, res) => {
  try {
    const https = require('https');
    https.get('https://ingress-a.flow.life/_next/static/media/377371f934d4841a-s.p.woff2', (r) => {
      res.set('Content-Type', 'font/woff2');
      res.set('Cache-Control', 'public, max-age=31536000');
      r.pipe(res);
    }).on('error', (e) => res.status(500).send(e.message));
  } catch(e) {
    res.status(500).send(e.message);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

init().catch(err => {
  console.error('DB init failed (will retry on next request):', err.message);
});
