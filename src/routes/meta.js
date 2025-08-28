import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { q } from '../db/pg.js';

const r = Router();

r.get('/me', auth, async (req, res) => {
  const { rows } = await q('SELECT * FROM users WHERE firebase_uid=$1', [req.user.uid]);
  res.json(rows[0] || { uid: req.user.uid, email: req.user.email });
});

r.put('/me', auth, async (req, res) => {
  const { full_name, phone } = req.body || {};
  if (full_name === undefined && phone === undefined) {
    return res.status(400).json({ error: 'full_name ou phone requis' });
  }

  try {
    await q('BEGIN');

    let u = await q('SELECT id FROM users WHERE firebase_uid=$1', [req.user.uid]);

    if (u.rowCount === 0) {
      const ins = await q(
        'INSERT INTO users (firebase_uid, role, full_name, email, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [req.user.uid, 'patient', full_name || 'Patient', req.user.email || null, phone || null]
      );
      u = { rows: [{ id: ins.rows[0].id }] };
    } else {
      if (full_name !== undefined) {
        await q('UPDATE users SET full_name=$1 WHERE id=$2', [full_name, u.rows[0].id]);
      }
      if (phone !== undefined) {
        await q('UPDATE users SET phone=$1 WHERE id=$2', [phone, u.rows[0].id]);
      }
    }

    await q('COMMIT');

    const { rows } = await q('SELECT * FROM users WHERE id=$1', [u.rows[0].id]);
    res.json(rows[0]);
  } catch (e) {
    await q('ROLLBACK');
    console.error('PUT /me error', e);
    res.status(500).json({ error: e.message });
  }
});

export default r;
