import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(base, 'docs');
const require = createRequire(import.meta.url);
const consent = require(join(docs, 'consent.js'));
const read = name => readFileSync(join(docs, name), 'utf8');

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const DEMO = [{ id: 'analytics', label: 'Mesure d’audience (démonstration)', description: 'illustration' }];

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); }
  };
};

class FakeNode {
  constructor(tag, doc) {
    this.tag = tag; this.doc = doc; this.attrs = {}; this.children = []; this.parentNode = null;
    this.listeners = {}; this.textContent = ''; this.checked = false; this.focused = false;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; }
  addEventListener(t, fn) { this.listeners[t] = fn; }
  fire(t, e) { this.listeners[t]?.(e); }
  focus() { this.focused = true; }
  walk() { return this.children.flatMap(c => [c, ...c.walk()]); }
  querySelector(sel) { return this.walk().find(n => n.tag === sel) ?? null; }
}

const fakeWin = ({ categories, storage = memoryStorage(), withManage = true } = {}) => {
  const doc = { body: null, byId: {} };
  doc.createElement = tag => new FakeNode(tag, doc);
  doc.body = new FakeNode('body', doc);
  doc.getElementById = id => {
    if (id === 'consent-manage') return doc.manage ?? null;
    return doc.body.walk().find(n => n.attrs.id === id) ?? null;
  };
  if (withManage) { doc.manage = new FakeNode('button', doc); doc.manage.setAttribute('hidden', ''); }
  const win = { document: doc, localStorage: storage };
  if (categories) win.__OLEASENSE_CONSENT_DEMO__ = categories;
  return win;
};
const byId = (win, id) => win.document.getElementById(id);

test('CA1 : TTL de 180 jours et clé de stockage', () => {
  assert.equal(consent.CONSENT_TTL_DAYS, 180);
  assert.equal(consent.CONSENT_KEY, 'oleasense_consent');
});

test('CA1 : getCategories — registre vide par défaut, démo filtrée', () => {
  assert.deepEqual(consent.getCategories(undefined), []);
  assert.deepEqual(consent.getCategories({}), []);
  assert.deepEqual(consent.getCategories({ __OLEASENSE_CONSENT_DEMO__: 'x' }), []);
  const out = consent.getCategories({ __OLEASENSE_CONSENT_DEMO__: [null, { id: '', label: 'a' }, { id: 'a' }, { id: 'ok', label: 'L' }, DEMO[0]] });
  assert.deepEqual(out, [{ id: 'ok', label: 'L', description: '' }, DEMO[0]]);
});

test('CA1 : shouldShowBanner faux si registre vide, vrai sans choix', () => {
  assert.equal(consent.shouldShowBanner([], null), false);
  assert.equal(consent.shouldShowBanner(DEMO, null), true);
  assert.equal(consent.shouldShowBanner(DEMO, { savedAt: NOW, choices: {} }), false);
});

test('CA1 : acceptAll / rejectAll', () => {
  assert.deepEqual(consent.acceptAll(DEMO), { analytics: true });
  assert.deepEqual(consent.rejectAll(DEMO), { analytics: false });
  assert.deepEqual(consent.rejectAll([]), {});
});

test('CA1 : saveConsent / readConsent, expiration et JSON invalide', () => {
  const s = memoryStorage();
  assert.equal(consent.readConsent(s, NOW), null);
  const saved = consent.saveConsent(s, { analytics: 'yes', x: true }, NOW);
  assert.deepEqual(saved, { savedAt: NOW, choices: { analytics: false, x: true } });
  assert.deepEqual(consent.readConsent(s, NOW + 179 * DAY), saved);
  assert.equal(consent.readConsent(s, NOW + 181 * DAY), null);
  assert.equal(consent.readConsent(s, NOW - DAY), null);
  s.data[consent.CONSENT_KEY] = '{oups';
  assert.equal(consent.readConsent(s, NOW), null);
  for (const bad of ['null', '{"savedAt":"x","choices":{}}', '{"savedAt":1,"choices":null}']) {
    s.data[consent.CONSENT_KEY] = bad;
    assert.equal(consent.readConsent(s, NOW), null);
  }
  assert.equal(consent.saveConsent(s, undefined, NOW).choices.constructor, Object);
});

test('CA1 : stockage indisponible toléré', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(consent.readConsent(broken, NOW), null);
  assert.equal(consent.readConsent(null, NOW), null);
  assert.equal(consent.saveConsent(broken, {}, NOW), null);
});

test('CA1/CA4 : initConsent sans catégorie — aucun bandeau, bouton masqué, rien stocké', () => {
  const win = fakeWin();
  const r = consent.initConsent(win, NOW);
  assert.deepEqual(r, { categories: [], shown: false });
  assert.equal(win.document.body.children.length, 0);
  assert.ok(win.document.manage.hasAttribute('hidden'));
  assert.deepEqual(win.localStorage.data, {});
  assert.equal(win.OLEASENSE_CONSENT, undefined);
});

test('CA1 : initConsent avec catégorie — bandeau à 3 boutons, refuser persiste', () => {
  const win = fakeWin({ categories: DEMO });
  const r = consent.initConsent(win, NOW);
  assert.equal(r.shown, true);
  assert.ok(!win.document.manage.hasAttribute('hidden'));
  const banner = byId(win, 'consent-banner');
  assert.equal(banner.attrs.role, 'region');
  assert.ok(banner.attrs['aria-label']);
  const labels = banner.walk().filter(n => n.tag === 'button').map(n => n.textContent);
  assert.deepEqual(labels, ['Tout refuser', 'Tout accepter', 'Personnaliser', 'Enregistrer']);
  byId(win, 'consent-reject').fire('click');
  assert.equal(byId(win, 'consent-banner'), null);
  assert.equal(JSON.parse(win.localStorage.data[consent.CONSENT_KEY]).choices.analytics, false);
  assert.deepEqual(win.OLEASENSE_CONSENT, { analytics: false });
  assert.ok(win.document.manage.focused);
});

test('CA1 : accepter tout, puis rechargement sans bandeau et exposition du choix', () => {
  const storage = memoryStorage();
  const win = fakeWin({ categories: DEMO, storage });
  consent.initConsent(win, NOW);
  byId(win, 'consent-accept').fire('click');
  assert.deepEqual(win.OLEASENSE_CONSENT, { analytics: true });
  const reload = fakeWin({ categories: DEMO, storage });
  const r = consent.initConsent(reload, Date.now());
  assert.equal(r.shown, false);
  assert.deepEqual(reload.OLEASENSE_CONSENT, { analytics: true });
});

test('CA1 : personnaliser puis enregistrer', () => {
  const win = fakeWin({ categories: DEMO });
  consent.initConsent(win, NOW);
  const details = byId(win, 'consent-details');
  const custom = byId(win, 'consent-customize');
  assert.ok(details.hasAttribute('hidden'));
  custom.fire('click');
  assert.ok(!details.hasAttribute('hidden'));
  assert.equal(custom.attrs['aria-expanded'], 'true');
  details.walk().find(n => n.tag === 'input').checked = true;
  byId(win, 'consent-save').fire('click');
  assert.deepEqual(win.OLEASENSE_CONSENT, { analytics: true });
  assert.equal(byId(win, 'consent-banner'), null);
});

test('CA1 : personnaliser bascule fermeture et enregistrement par défaut = refus', () => {
  const win = fakeWin({ categories: DEMO });
  consent.initConsent(win, NOW);
  const custom = byId(win, 'consent-customize');
  custom.fire('click');
  custom.fire('click');
  assert.ok(byId(win, 'consent-details').hasAttribute('hidden'));
  assert.equal(custom.attrs['aria-expanded'], 'false');
  byId(win, 'consent-save').fire('click');
  assert.deepEqual(win.OLEASENSE_CONSENT, { analytics: false });
});

test('CA1 : le pied de page rouvre le bandeau, sans doublon ; Échap ferme', () => {
  const storage = memoryStorage();
  consent.saveConsent(storage, { analytics: false }, Date.now());
  const win = fakeWin({ categories: DEMO, storage });
  assert.equal(consent.initConsent(win).shown, false);
  win.document.manage.fire('click');
  assert.ok(byId(win, 'consent-banner'));
  win.document.manage.fire('click');
  assert.equal(win.document.body.children.length, 1);
  const banner = byId(win, 'consent-banner');
  banner.fire('keydown', { key: 'a' });
  assert.ok(byId(win, 'consent-banner'));
  banner.fire('keydown', { key: 'Escape' });
  assert.equal(byId(win, 'consent-banner'), null);
});

test('CA1 : choix expiré — bandeau réaffiché', () => {
  const storage = memoryStorage();
  consent.saveConsent(storage, { analytics: true }, NOW);
  const win = fakeWin({ categories: DEMO, storage });
  assert.equal(consent.initConsent(win, NOW + 181 * DAY).shown, true);
});

test('CA1 : initConsent tolère l’absence du bouton et du stockage', () => {
  const win = fakeWin({ categories: DEMO, withManage: false });
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('refusé'); } });
  assert.equal(consent.initConsent(win, NOW).shown, true);
  byId(win, 'consent-reject').fire('click');
  assert.deepEqual(win.OLEASENSE_CONSENT, { analytics: false });
});

const pages = ['index.html', 'a-propos.html', 'mentions-legales.html', 'confirmation.html', 'politique-confidentialite.html'];

test('CA1/CA2 : chaque page a le bouton de préférences, consent.js et le lien vers la politique', () => {
  for (const p of pages) {
    const html = read(p);
    assert.match(html, /<button type="button" id="consent-manage"[^>]*\shidden>/, p);
    if (p !== 'a-propos.html') assert.match(html, /<script src="consent\.js" defer>/, p);
    else assert.doesNotMatch(html, /<script/, p);
    assert.match(html, /<link rel="stylesheet" href="consent\.css">/, p);
    assert.match(html, /href="politique-confidentialite\.html"/, p);
  }
  assert.match(read('mentions-legales.html'), /politique de confidentialité<\/a>/);
  assert.doesNotMatch(read('mentions-legales.html'), /ne dépose aucun cookie/);
});

test('CA2 : page politique — un seul h1, sections droits, CNIL, cookies, sitemap', () => {
  const html = read('politique-confidentialite.html');
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /<html lang="fr">/);
  for (const s of ['Vos droits', 'Cookies et traceurs', 'Durées de conservation', 'Bases légales']) assert.match(html, new RegExp(s));
  assert.match(html, /cnil\.fr/);
  assert.match(html, /180 jours/);
  assert.match(read('sitemap.xml'), /politique-confidentialite\.html/);
});

test('CA3 : registre interne hors docs et hors sitemap', () => {
  assert.ok(existsSync(join(base, 'internal', 'registre-traitement-prospects.md')));
  assert.ok(!existsSync(join(docs, 'registre-traitement-prospects.md')));
  assert.doesNotMatch(read('sitemap.xml'), /registre/);
  assert.match(readFileSync(join(base, '.dockerignore'), 'utf8'), /^internal\/$/m);
  assert.match(readFileSync(join(base, 'Dockerfile'), 'utf8'), /COPY docs\//);
});

test('CA4 : consent.js sans cookie ni requête ni ressource externe', () => {
  const src = read('consent.js');
  assert.doesNotMatch(src, /document\.cookie|fetch|XMLHttpRequest|sendBeacon|sessionStorage/);
  assert.doesNotMatch(src, /https?:\/\//);
  assert.doesNotMatch(read('consent.css'), /https?:\/\/|@import/);
});
