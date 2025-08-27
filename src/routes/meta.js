import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { q } from '../db/pg.js';

const r = Router();

r.get('/me', auth, async (req, res) => {
  const { rows } = await q('SELECT * FROM users WHERE firebase_uid=$1', [req.user.uid]);
  res.json(rows[0] || { uid: req.user.uid, email: req.user.email });
});

export default r;
