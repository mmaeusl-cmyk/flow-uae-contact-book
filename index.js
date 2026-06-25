const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: 'pgsql-flex-resources-ftools-prod-eastus2.postgres.database.azure.com',
  port: 6432,
  database: 'production_resource_wdvfwpqjtrpxosypgs',
  user: 'service_resource_wdvfwpqjtrpxosypgs',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT,
      company TEXT,
      email TEXT,
      phone TEXT,
      linkedin TEXT,
      category TEXT,
      status TEXT,
      last_meeting TEXT,
      next_meeting TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database ready');
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/contacts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts ORDER BY created_at ASC');
    res.json(result.rows.map(r => ({
      id: r.id,
      name: r.name,
      company: r.company,
      email: r.email,
      phone: r.phone,
      linkedin: r.linkedin,
      category: r.category,
      status: r.status,
      lastMeeting: r.last_meeting,
      nextMeeting: r.next_meeting,
      notes: r.notes
    })));
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/contacts', async (req, res) => {
  const contacts = req.body;
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'Expected array' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM contacts');
    for (const c of contacts) {
      await client.query(
        `INSERT INTO contacts (id, name, company, email, phone, linkedin, category, status, last_meeting, next_meeting, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [c.id, c.name, c.company, c.email, c.phone, c.linkedin, c.category, c.status, c.lastMeeting, c.nextMeeting, c.notes]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
init().then(() => {
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize:', err);
  process.exit(1);
});
