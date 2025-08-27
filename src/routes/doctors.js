import { Router } from 'express';
import { q } from '../db/pg.js';
import { generateSlots } from '../services/availability.js';

const r = Router();

r.get('/', async (req, res) => {
  const { q: search, specialization_id } = req.query;
  const params = [];
  let sql = `
    SELECT d.id,
           u.full_name,
           u.email,
           COALESCE(json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name))
             FILTER (WHERE s.id IS NOT NULL), '[]') AS specializations
    FROM doctors d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN doctor_specializations ds ON ds.doctor_id = d.id
    LEFT JOIN specializations s ON s.id = ds.specialization_id`;
  const where = [];
  if (specialization_id) { params.push(String(specialization_id)); where.push(`s.id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`u.full_name ILIKE $${params.length}`); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' GROUP BY d.id, u.full_name, u.email ORDER BY u.full_name ASC';
  const { rows } = await q(sql, params);
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT d.id, u.full_name, u.email, d.bio, d.years_experience
     FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=$1`,
    [String(req.params.id)]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

r.get('/:id/availability', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from & to required (ISO)' });
  const slots = await generateSlots(String(req.params.id), String(from), String(to));
  res.json(slots);
});

export default r;
