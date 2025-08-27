// api/src/firebaseAdmin.js
import admin from 'firebase-admin';

function getPrivateKeyFromEnv() {
  // Option 1: base64 (si défini)
  if (process.env.FIREBASE_PRIVATE_KEY_B64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, 'base64').toString('utf8');
      return decoded;
    } catch {
      throw new Error('FIREBASE_PRIVATE_KEY_B64 est invalide (base64).');
    }
  }

  // Option 2: clé avec \n littéraux
  let pk = process.env.FIREBASE_PRIVATE_KEY || '';
  // remplace \n -> vraie fin de ligne
  if (pk.includes('\\n')) pk = pk.replace(/\\n/g, '\n');
  return pk;
}

const privateKey = getPrivateKeyFromEnv();
const projectId  = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

// DEBUG: Ajoutons des logs pour voir ce qui se passe
console.log('=== DEBUG FIREBASE ===');
console.log('projectId:', projectId);
console.log('clientEmail:', clientEmail);
console.log('privateKey length:', privateKey.length);
console.log('privateKey starts with:', privateKey.substring(0, 50));
console.log('privateKey ends with:', privateKey.substring(privateKey.length - 50));
console.log('======================');

// Validation amicale (sans logger la clé)
const beginsOk = privateKey.startsWith('-----BEGIN PRIVATE KEY-----\n');
const endsOk   = privateKey.endsWith('\n-----END PRIVATE KEY-----\n');

console.log('beginsOk:', beginsOk);
console.log('endsOk:', endsOk);

if (!projectId || !clientEmail) {
  throw new Error('FIREBASE_PROJECT_ID ou FIREBASE_CLIENT_EMAIL manquant(s) dans .env');
}
if (!privateKey) {
  throw new Error('FIREBASE_PRIVATE_KEY manquant dans .env (ou FIREBASE_PRIVATE_KEY_B64).');
}
if (!beginsOk || !endsOk) {
  throw new Error(
    'FIREBASE_PRIVATE_KEY mal formatée. Assure-toi que:\n' +
    '- elle commence par "-----BEGIN PRIVATE KEY-----\\n"\n' +
    '- elle finit par "\\n-----END PRIVATE KEY-----\\n"\n' +
    '- les \\n sont des LITTERAUX dans .env (pas de vraies nouvelles lignes).'
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export default admin;