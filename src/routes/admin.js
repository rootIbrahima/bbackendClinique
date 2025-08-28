import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { q } from '../db/pg.js';
import adminSdk from '../firebaseAdmin.js';
import crypto from 'crypto';

const r = Router();

// Toutes les routes ci-dessous nécessitent un token + rôle admin
r.use(auth, requireRole('admin'));

// Utilitaires
const allowedRoles = new Set(['patient', 'doctor', 'admin']);
function genTempPassword() {
  return 'Temp' + crypto.randomBytes(4).toString('hex'); // ex: Temp9a3f12c4
}

/**
 * GET /admin/doctors
 * Liste des médecins (avec infos user et spécialités)
 */
r.get('/doctors', async (_req, res) => {
  const { rows } = await q(`
    SELECT d.id AS doctor_id,
           u.id AS user_id,
           u.full_name,
           u.email,
           u.role,
           d.bio,
           d.years_experience,
           COALESCE(
             json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name))
             FILTER (WHERE s.id IS NOT NULL),
             '[]'
           ) AS specializations
    FROM doctors d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN doctor_specializations ds ON ds.doctor_id = d.id
    LEFT JOIN specializations s ON s.id = ds.specialization_id
    GROUP BY d.id, u.id, u.full_name, u.email, u.role, d.bio, d.years_experience
    ORDER BY u.full_name ASC
  `);
  res.json(rows);
});

/**
 * POST /admin/specializations
 * body: { name }
 */
r.post('/specializations', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const { rows } = await q(
    `INSERT INTO specializations (name)
     VALUES ($1) ON CONFLICT (name) DO NOTHING
     RETURNING *`,
    [name.trim()]
  );
  res.status(201).json(rows[0] || { ok: true }); // si déjà existait
});

/**
 * DELETE /admin/specializations/:id
 */
r.delete('/specializations/:id', async (req, res) => {
  try {
    await q('DELETE FROM specializations WHERE id=$1', [String(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /admin/specializations/:id', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /admin/users/role
 * body: { email? , firebase_uid?, role }
 * -> change le rôle d'un user (patient/doctor/admin)
 *   - si email fourni, on essaie de trouver le Firebase UID via Firebase Admin
 */
r.post('/users/role', async (req, res) => {
  let { email, firebase_uid, role } = req.body || {};
  if (!role || !allowedRoles.has(role)) {
    return res.status(400).json({ error: `role must be one of: ${[...allowedRoles].join(', ')}` });
  }

  try {
    if (!firebase_uid && email) {
      try {
        const u = await adminSdk.auth().getUserByEmail(email);
        firebase_uid = u.uid;
      } catch (e) {
        return res.status(404).json({ error: 'Firebase user not found by email' });
      }
    }

    if (!firebase_uid) return res.status(400).json({ error: 'email or firebase_uid required' });

    const u = await q('SELECT id FROM users WHERE firebase_uid=$1', [firebase_uid]);
    if (u.rowCount === 0) return res.status(404).json({ error: 'User not found in DB' });

    await q('UPDATE users SET role=$1 WHERE id=$2', [role, u.rows[0].id]);

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /admin/users/role', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /admin/doctors
 * Crée (ou prépare) un compte médecin complet.
 * body: {
 *   email, password?, full_name,
 *   bio?, years_experience?,
 *   specializations?: [ "Cardiologie", "Pédiatrie", ... ]
 * }
 * - si l'email n'existe pas dans Firebase -> crée l'utilisateur Firebase (avec password ou random)
 * - upsert users(role='doctor'), upsert doctors, upsert specializations & liaisons
 * - renvoie doctor_id, user_id, tempPassword (si généré)
 */
r.post('/doctors', async (req, res) => {
  let {
    email,
    password,
    full_name,
    bio = null,
    years_experience = 0,
    specializations = []
  } = req.body || {};

  if (!email || !full_name) return res.status(400).json({ error: 'email & full_name required' });
  email = String(email).trim().toLowerCase();
  full_name = String(full_name).trim();
  years_experience = Number(years_experience || 0);
  if (!Number.isFinite(years_experience) || years_experience < 0) years_experience = 0;

  // 1) Firebase: get or create user
  let uid = null;
  let tempPassword;
  try {
    const u = await adminSdk.auth().getUserByEmail(email);
    uid = u.uid;
  } catch (_e) {
    // create Firebase user
    if (!password || String(password).length < 6) {
      tempPassword = genTempPassword();
      password = tempPassword;
    }
    const created = await adminSdk.auth().createUser({
      email,
      password,
      displayName: full_name
    });
    uid = created.uid;
  }

  try {
    await q('BEGIN');

    // 2) Upsert users
    let userRow = await q('SELECT id FROM users WHERE firebase_uid=$1', [uid]);
    if (userRow.rowCount === 0) {
      const ins = await q(
        'INSERT INTO users (firebase_uid, role, full_name, email) VALUES ($1,$2,$3,$4) RETURNING id',
        [uid, 'doctor', full_name, email]
      );
      userRow = { rows: [{ id: ins.rows[0].id }] };
    } else {
      await q('UPDATE users SET role=$1, full_name=$2, email=$3 WHERE id=$4',
        ['doctor', full_name, email, userRow.rows[0].id]);
    }

    // 3) Upsert doctors (1:1 user)
    let doc = await q('SELECT id FROM doctors WHERE user_id=$1', [userRow.rows[0].id]);
    if (doc.rowCount === 0) {
      const ins = await q(
        'INSERT INTO doctors (user_id, bio, years_experience) VALUES ($1,$2,$3) RETURNING id',
        [userRow.rows[0].id, bio, years_experience]
      );
      doc = { rows: [{ id: ins.rows[0].id }] };
    } else {
      await q('UPDATE doctors SET bio=$1, years_experience=$2 WHERE id=$3',
        [bio, years_experience, doc.rows[0].id]);
    }

    // 4) Upsert specializations & link
    if (Array.isArray(specializations)) {
      for (const rawName of specializations) {
        const name = String(rawName || '').trim();
        if (!name) continue;
        let s = await q('INSERT INTO specializations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id', [name]);
        if (s.rowCount === 0) {
          s = await q('SELECT id FROM specializations WHERE name=$1', [name]);
        }
        await q(
          'INSERT INTO doctor_specializations (doctor_id, specialization_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [doc.rows[0].id, s.rows[0].id]
        );
      }
    }

    await q('COMMIT');

    res.status(201).json({
      ok: true,
      doctor_id: doc.rows[0].id,
      user_id: userRow.rows[0].id,
      email,
      tempPassword: tempPassword || undefined
    });
  } catch (e) {
    await q('ROLLBACK');
    console.error('POST /admin/doctors error', e);
    res.status(500).json({ error: e.message });
  }
});

export default r;
