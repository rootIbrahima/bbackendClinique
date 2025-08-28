import { Router } from 'express';
import { q } from '../db/pg.js';

const r = Router();

r.get('/', async (_req, res) => {
  const { rows } = await q(`
    SELECT s.id, s.name,
           COALESCE(COUNT(ds.doctor_id), 0)::int AS doctors_count
    FROM specializations s
    LEFT JOIN doctor_specializations ds ON ds.specialization_id = s.id
    GROUP BY s.id, s.name
    ORDER BY s.name ASC
  `);
  res.json(rows);
});

export default r;
