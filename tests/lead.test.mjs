import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const require = createRequire(import.meta.url);
const lead = require(join(docs, 'lead.js'));
const read = name => readFileSync(join(docs, name), 'utf8');
const html = read('index.html');

const valide = {
  name: 'Jeanne Martin', email: 'jeanne@example.org', phone: '+33 6 12 34 56 78',
  domainName: 'Domaine des Oliviers', surfaceHa: '12,5', location: 'Nyons', consent: true
};

test('CA1 : le formulaire expose les champs, le consentement et le champ piège', () => {
  assert.match(html, /<form id="lead-form"/);
  for (const n of ['name', 'email', 'phone', 'domainName', 'surfaceHa', 'location', 'consent', 'website']) {
    assert.match(html, new RegExp('name="' + n + '"'));
  }
  assert.match(html, /class="lead-trap" aria-hidden="true"/);
  assert.match(html, /id="lead-website" name="website" type="text" tabindex="-1"/);
  assert.match(html, /id="lead-erreur"[^>]*role="alert"/);
  assert.match(html, /mailto:contact@oleasense\.com/);
  assert.equal((html.match(/<h1/g) || []).length, 1);
});

test('CA8 : scripts locaux, config relative, aucune ressource externe', () => {
  assert.match(html, /<script src="config\.js" defer>/);
  assert.match(html, /<script src="lead\.js" defer>/);
  assert.match(html, /script\.js\?v=10/);
  assert.match(read('config.js'), /apiBaseUrl: ''/);
  for (const f of ['lead.js', 'config.js', 'confirmation.html']) {
    assert.doesNotMatch(read(f), /https?:\/\/(?!oleasense\.com)/);
    assert.doesNotMatch(read(f), /document\.cookie|localStorage|sessionStorage/);
  }
});

test('CA3 : page de confirmation et sitemap', () => {
  const c = read('confirmation.html');
  assert.match(c, /<html lang="fr">/);
  assert.equal((c.match(/<h1/g) || []).length, 1);
  assert.match(read('sitemap.xml'), /confirmation\.html/);
});

test('validateLead : cas valide et bornes', () => {
  assert.deepEqual(lead.validateLead(valide), { ok: true, erreurs: {} });
  assert.equal(lead.validateLead(undefined).ok, false);
  const r = lead.validateLead({ ...valide, name: ' ', email: 'x', phone: 'abc', surfaceHa: '0', consent: false, location: 'a'.repeat(151), domainName: '' });
  assert.deepEqual(Object.keys(r.erreurs).sort(), ['consent', 'domainName', 'email', 'location', 'name', 'phone', 'surfaceHa']);
  assert.equal(lead.validateLead({ ...valide, surfaceHa: '100000' }).ok, true);
  assert.equal(lead.validateLead({ ...valide, surfaceHa: '100001' }).ok, false);
  assert.equal(lead.validateLead({ ...valide, surfaceHa: '0.1' }).ok, true);
  assert.equal(lead.validateLead({ ...valide, surfaceHa: 'abc' }).ok, false);
  assert.equal(lead.validateLead({ ...valide, surfaceHa: 5 }).ok, true);
  assert.equal(lead.validateLead({ ...valide, email: 'a'.repeat(250) + '@b.co' }).ok, false);
  assert.equal(lead.validateLead({ ...valide, name: 42 }).ok, false);
});

test('buildPayload : normalise les valeurs', () => {
  assert.deepEqual(lead.buildPayload({ ...valide, name: '  Jeanne ' }), {
    name: 'Jeanne', email: 'jeanne@example.org', phone: '+33 6 12 34 56 78', domainName: 'Domaine des Oliviers',
    surfaceHa: 12.5, location: 'Nyons', consent: true, website: ''
  });
  assert.equal(lead.buildPayload({ ...valide, website: 'bot' }).website, 'bot');
  assert.equal(lead.buildPayload(undefined).consent, false);
});

test('leadUrl : base configurable', () => {
  assert.equal(lead.leadUrl({ apiBaseUrl: '' }), '/api/v1/public/leads');
  assert.equal(lead.leadUrl(undefined), '/api/v1/public/leads');
  assert.equal(lead.leadUrl({ apiBaseUrl: ' https://api.example.org// ' }), 'https://api.example.org/api/v1/public/leads');
  assert.equal(lead.leadUrl({ apiBaseUrl: 3 }), '/api/v1/public/leads');
});

test('messageErreurHttp', () => {
  assert.match(lead.messageErreurHttp(429), /Trop de demandes/);
  assert.match(lead.messageErreurHttp(400), /invalides/);
  assert.match(lead.messageErreurHttp(500), /échoué/);
});

test('submitLead : POST JSON, succès, erreur HTTP et réseau', async () => {
  let appel;
  const ok = await lead.submitLead({ a: 1 }, { apiBaseUrl: '' }, (u, o) => { appel = [u, o]; return Promise.resolve({ ok: true, status: 201 }); });
  assert.deepEqual(ok, { ok: true });
  assert.equal(appel[0], '/api/v1/public/leads');
  assert.equal(appel[1].method, 'POST');
  assert.equal(appel[1].headers['Content-Type'], 'application/json');
  assert.equal(appel[1].body, '{"a":1}');
  const ko = await lead.submitLead({}, {}, () => Promise.resolve({ ok: false, status: 429 }));
  assert.equal(ko.ok, false);
  assert.match(ko.erreur, /Trop de demandes/);
  const net = await lead.submitLead({}, {}, () => Promise.reject(new Error('x')));
  assert.match(net.erreur, /échoué/);
});

test('submitLead : le corps de la réponse est lu avant de conclure', async () => {
  let lu = false;
  const rep = { ok: true, status: 201, text: () => { lu = true; return Promise.resolve('{"id":"1"}'); } };
  assert.deepEqual(await lead.submitLead({}, {}, () => Promise.resolve(rep)), { ok: true });
  assert.equal(lu, true);
  const illisible = { ok: true, status: 201, text: () => Promise.reject(new Error('x')) };
  assert.deepEqual(await lead.submitLead({}, {}, () => Promise.resolve(illisible)), { ok: true });
});

function fakeDom(values) {
  const listeners = {};
  const mk = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() { this.focused = true; } });
  const elements = {};
  for (const n of ['name', 'email', 'phone', 'domainName', 'surfaceHa', 'location', 'website']) elements[n] = { ...mk(), value: values[n] || '' };
  elements.consent = { ...mk(), checked: values.consent === true };
  const bouton = { disabled: false };
  const zone = { hidden: true, children: [], textContent: '', appendChild(c) { this.children.push(c.textContent); } };
  const form = { elements, addEventListener: (e, f) => { listeners[e] = f; }, querySelector: () => bouton };
  const doc = { getElementById: id => (id === 'lead-form' ? form : zone), createElement: () => ({ textContent: '' }) };
  return { doc, listeners, bouton, zone, elements };
}

test('initForm : sans formulaire, rien ne se passe', () => {
  lead.initForm({ getElementById: () => null }, {});
});

test('initForm : erreurs de validation affichées, aucun appel réseau', () => {
  const d = fakeDom({ ...valide, consent: false });
  let fetched = false;
  lead.initForm(d.doc, { fetch: () => { fetched = true; } });
  let prevented = false;
  d.listeners.submit({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(fetched, false);
  assert.equal(d.zone.hidden, false);
  assert.equal(d.elements.consent.attrs['aria-invalid'], 'true');
  assert.ok(d.elements.consent.focused);
});

test('initForm : succès redirige vers confirmation.html', async () => {
  const d = fakeDom(valide);
  let cible; let corps;
  const win = {
    OLEASENSE_CONFIG: { apiBaseUrl: '' },
    fetch: (u, o) => { corps = o.body; return Promise.resolve({ ok: true, status: 201 }); },
    location: { assign: u => { cible = u; } }
  };
  lead.initForm(d.doc, win);
  d.listeners.submit({ preventDefault() {} });
  await new Promise(r => setImmediate(r));
  assert.equal(cible, 'confirmation.html');
  assert.equal(JSON.parse(corps).surfaceHa, 12.5);
  assert.equal(d.zone.hidden, true);
});

test('initForm : échec serveur affiche l\'erreur et réactive le bouton', async () => {
  const d = fakeDom(valide);
  const win = { fetch: () => Promise.resolve({ ok: false, status: 429 }), location: { assign() { throw new Error('non'); } } };
  lead.initForm(d.doc, win);
  d.listeners.submit({ preventDefault() {} });
  assert.equal(d.bouton.disabled, true);
  await new Promise(r => setImmediate(r));
  assert.equal(d.bouton.disabled, false);
  assert.equal(d.zone.hidden, false);
  assert.match(d.zone.children[0], /Trop de demandes/);
});
