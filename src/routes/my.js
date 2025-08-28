import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { q } from '../db/pg.js';

const r = Router();

/** Toutes ces routes nécessitent un token Firebase + rôle doctor/admin */
r.use(auth, requireRole('doctor'));

/** GET /my/availability : liste des plages (doctor_availability) du médecin courant */
r.get('/availability', async (req, res) => {
  if (!req.doctorId) return res.status(404).json({ error: 'Doctor profile missing' });
  const { rows } = await q(
    `SELECT id, weekday, start_time, end_time, slot_minutes
     FROM doctor_availability
     WHERE doctor_id=$1
     ORDER BY weekday, start_time`,
    [req.doctorId]
  );
  res.json(rows);
});

/** POST /my/availability : ajoute une plage
 * body: { weekday: 0..6, start_time: '09:00', end_time: '12:00', slot_minutes: 30 }
 */
r.post('/availability', async (req, res) => {
  const { weekday, start_time, end_time, slot_minutes } = req.body || {};
  if (
    typeof weekday !== 'number' || weekday < 0 || weekday > 6 ||
    !start_time || !end_time ||
    !slot_minutes
  ) return res.status(400).json({ error: 'weekday (0-6), start_time, end_time, slot_minutes required' });

  try {
    const ins = await q(
      `INSERT INTO doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.doctorId, weekday, start_time, end_time, slot_minutes]
    );
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error('POST /my/availability', e);
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /my/availability/:id : supprime une plage du médecin */
r.delete('/availability/:id', async (req, res) => {
  try {
    await q('DELETE FROM doctor_availability WHERE id=$1 AND doctor_id=$2', [String(req.params.id), req.doctorId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /my/availability/:id', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /my/appointments : agenda du médecin (prochains RDV) */
r.get('/appointments', async (req, res) => {
  const { rows } = await q(
    `SELECT a.id, a.starts_at, a.ends_at, a.status,
            pu.full_name AS patient_name, pu.email AS patient_email
     FROM appointments a
     JOIN doctors d ON d.id=a.doctor_id
     JOIN users pu ON pu.id=a.patient_id
     WHERE a.doctor_id=$1
     ORDER BY a.starts_at ASC`,
    [req.doctorId]
  );
  res.json(rows);
});

export default r;
