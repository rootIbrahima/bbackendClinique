// src/app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { q } from './db/pg.js';
import doctors from './routes/doctors.js';   // en haut
import appointments from './routes/appointments.js'; // 👈 ajoute
import meta from './routes/meta.js';                 // 👈 ajoute


const app = express();
app.use(cors());
app.use(express.json());

// route de test
app.get('/ping', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.use('/doctors', doctors);                // après app.get('/ping', ...)

app.use('/appointments', appointments); // 👈 ajoute
app.use('/', meta);                     // 👈 ajoute  (donc GET /me)

app.get('/db/now', async (_req, res) => {
  const r = await q('SELECT now() AS now');
  res.json(r.rows[0]);
});


const port = process.env.PORT || 4000;
app.listen(port, () => console.log('API on :' + port));
