import admin from '../firebaseAdmin.js';

export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'Missing Bearer token' });

  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    req.user = { uid: decoded.uid, email: decoded.email || null };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
