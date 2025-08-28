import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { q } from './db/pg.js';

import doctors from './routes/doctors.js';
import appointments from './routes/appointments.js';
import meta from './routes/meta.js';
import specializations from './routes/specializations.js';
import my from './routes/my.js';
import adminRoutes from './routes/admin.js'; // 👈

const app = express();
app.use(cors());
app.use(express.json());

// logger simple
app.use((req, _res, next) => { console.log(req.method, req.url); next(); });

// santé
app.get('/ping', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

// test DB
app.get('/db/now', async (_req, res) => {
  const r = await q('SELECT now() AS now');
  res.json(r.rows[0]);
});

// routes métier
app.use('/doctors', doctors);
app.use('/appointments', appointments);
app.use('/specializations', specializations);
app.use('/my', my);
app.use('/admin', adminRoutes); // 👈
app.use('/', meta);             // /me

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('API on :' + port));
