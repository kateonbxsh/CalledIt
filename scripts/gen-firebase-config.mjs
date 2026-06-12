// Generates public/firebase-config.json for the messaging service worker.
//
// The service worker (public/firebase-messaging-sw.js) is a static file and
// cannot read Vite's import.meta.env, so it fetches this JSON at runtime.
// In CI the GitHub Pages workflow writes the file from secrets; this script
// does the same locally from .env* files so `npm run dev` has working push.
//
// Value resolution prefers process.env (how CI passes secrets to the build
// step) and falls back to Vite's .env* loader (local development).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const fileEnv = loadEnv(mode, root, 'VITE_');

const pick = (key) => process.env[key] || fileEnv[key] || '';

const config = {
  apiKey: pick('VITE_FIREBASE_API_KEY'),
  authDomain: pick('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: pick('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: pick('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: pick('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: pick('VITE_FIREBASE_APP_ID'),
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length === Object.keys(config).length) {
  // No values at all — likely a fresh clone with no env. Don't clobber a file
  // that an earlier CI step may have written; just warn and exit cleanly.
  console.warn('[gen-firebase-config] No VITE_FIREBASE_* values found; skipping write.');
  process.exit(0);
}

if (missing.length) {
  console.warn(`[gen-firebase-config] Missing values: ${missing.join(', ')} (wrote partial config).`);
}

const out = resolve(root, 'public/firebase-config.json');
writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[gen-firebase-config] Wrote ${out}`);
