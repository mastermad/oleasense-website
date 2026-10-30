// Client minimal de l'API OVH (aucune dépendance) pour gérer la zone DNS d'OleaSense.
// Identifiants : variables d'environnement ou fichier indiqué par --env (jamais affichés).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ENDPOINTS = { 'ovh-eu': 'https://eu.api.ovh.com/1.0' };

export function loadEnv(file) {
  if (file) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  for (const name of ['OVH_APPLICATION_KEY', 'OVH_APPLICATION_SECRET', 'OVH_CONSUMER_KEY']) {
    if (!process.env[name]) throw new Error(`Variable manquante : ${name}`);
  }
}

export function createClient() {
  const base = ENDPOINTS[process.env.OVH_ENDPOINT ?? 'ovh-eu'];
  if (!base) throw new Error('OVH_ENDPOINT inconnu');
  let delta = null;

  async function serverTime() {
    if (delta === null) {
      const response = await fetch(`${base}/auth/time`);
      delta = Number(await response.text()) - Math.round(Date.now() / 1000);
    }
    return Math.round(Date.now() / 1000) + delta;
  }

  return async function call(method, path, body) {
    const url = `${base}${path}`;
    const payload = body === undefined ? '' : JSON.stringify(body);
    const timestamp = await serverTime();
    const signature = '$1$' + createHash('sha1')
      .update([process.env.OVH_APPLICATION_SECRET, process.env.OVH_CONSUMER_KEY, method, url, payload, timestamp].join('+'))
      .digest('hex');
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Ovh-Application': process.env.OVH_APPLICATION_KEY,
        'X-Ovh-Consumer': process.env.OVH_CONSUMER_KEY,
        'X-Ovh-Timestamp': String(timestamp),
        'X-Ovh-Signature': signature
      },
      body: payload || undefined
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}
