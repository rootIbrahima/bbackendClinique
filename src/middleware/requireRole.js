import { q } from '../db/pg.js';

/**
 * requireRole('admin') -> autorise les users avec role 'admin'
 * requireRole('doctor') -> autorise 'doctor' OU 'admin'
 *
 * Ajoute :
 *  - req.userDbId : id dans table users
 *  - req.doctorId : id dans doctors (si role doctor/admin et profil créé)
 */
export function requireRole(role) {
  return async function (req, res, next) {
    try {
      const u = await q('SELECT id, role FROM users WHERE firebase_uid=$1', [req.user.uid]);
      if (u.rowCount === 0) return res.status(403).json({ error: 'User not found in DB' });

      const userDb = u.rows[0];
      const ok =
        role === 'admin'
          ? userDb.role === 'admin'
          : (userDb.role === role || userDb.role === 'admin');

      if (!ok) return res.status(403).json({ error: `Forbidden: role '${role}' required` });

      req.userDbId = userDb.id;

      if (role === 'doctor' || userDb.role === 'admin') {
        const d = await q('SELECT id FROM doctors WHERE user_id=$1', [userDb.id]);
        req.doctorId = d.rows[0]?.id || null;
      }

      next();
    } catch (e) {
      console.error('requireRole error', e);
      res.status(500).json({ error: e.message });
    }
  };
}
