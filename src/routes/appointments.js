import { Router } from 'express';
import { q } from '../db/pg.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v));

r.get('/', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT a.*, du.full_name AS doctor_name
       FROM appointments a
       JOIN doctors d ON d.id=a.doctor_id
       JOIN users du ON du.id=d.user_id
       JOIN users pu ON pu.id=a.patient_id
       WHERE pu.firebase_uid=$1
       ORDER BY a.starts_at ASC`,
      [req.user.uid]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /appointments error', e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/', async (req, res) => {
  const { doctor_id, starts_at } = req.body || {};
  if (!doctor_id || !starts_at) return res.status(400).json({ error: 'doctor_id & starts_at required' });
  if (!isUUID(doctor_id)) return res.status(400).json({ error: 'doctor_id must be a UUID' });

  const startsAt = new Date(starts_at);
  if (isNaN(startsAt.getTime())) return res.status(400).json({ error: 'starts_at must be ISO date' });

  const slotMin = 30;
  const endsAt = new Date(startsAt.getTime() + slotMin * 60000);

  try {
    await q('BEGIN');

    const doc = await q('SELECT id FROM doctors WHERE id=$1', [doctor_id]);
    if (doc.rowCount === 0) { await q('ROLLBACK'); return res.status(404).json({ error: 'Doctor not found' }); }

    let patient = await q('SELECT id FROM users WHERE firebase_uid=$1', [req.user.uid]);
    if (patient.rowCount === 0) {
      const insUser = await q(
        'INSERT INTO users (firebase_uid, role, full_name, email) VALUES ($1,$2,$3,$4) RETURNING id',
        [req.user.uid, 'patient', req.user.email || 'Patient', req.user.email || null]
      );
      patient = { rows: [{ id: insUser.rows[0].id }] };
    }

    const weekday = startsAt.getUTCDay(); // 0..6
    const dayStr = startsAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const rules = await q(
      'SELECT start_time, end_time, slot_minutes FROM doctor_availability WHERE doctor_id=$1 AND weekday=$2',
      [doctor_id, weekday]
    );
    const inAnyRule = rules.rows.some(r => {
      const st = new Date(`${dayStr}T${r.start_time}Z`);
      const en = new Date(`${dayStr}T${r.end_time}Z`);
      return startsAt >= st && endsAt <= en;
    });
    if (!inAnyRule) { await q('ROLLBACK'); return res.status(400).json({ error: 'Chosen time not in doctor availability' }); }

    const ins = await q(
      'INSERT INTO appointments (patient_id, doctor_id, starts_at, ends_at) VALUES ($1,$2,$3,$4) RETURNING *',
      [patient.rows[0].id, doctor_id, startsAt.toISOString(), endsAt.toISOString()]
    );

    await q('COMMIT');
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    await q('ROLLBACK');
    console.error('POST /appointments error', e);
    if (e.code === '23505') return res.status(409).json({ error: 'Slot already booked' });
    if (e.code === '23503') return res.status(400).json({ error: 'Invalid foreign key' });
    return res.status(500).json({ error: e.message });
  }
});

r.delete('/:id', async (req, res) => {
  try {
    await q(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [String(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /appointments error', e);
    res.status(500).json({ error: e.message });
  }
});

export default r;
