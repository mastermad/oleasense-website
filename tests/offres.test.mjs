import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const require = createRequire(import.meta.url);
const roi = require(join(docs, 'roi.js'));
const read = name => readFileSync(join(docs, name), 'utf8');
const data = JSON.parse(read('data/offres.json'));
const html = read('simulations.html');
const index = read('index.html');
const hyp = data.hypotheses;

test('CA1 : trois offres valides et section #offres', () => {
  assert.deepEqual(data.offres.map(o => o.id), ['solo', 'premium', 'moulinier-coop']);
  for (const o of data.offres) {
    assert.ok(o.nom && o.description && o.inclus.length > 0);
    assert.ok(typeof o.prixMensuelHT === 'number' && o.prixMensuelHT >= 0);
  }
  assert.match(html, /id="offres"/);
  assert.match(index, /id="offres"/);
  assert.match(index, /href="simulations\.html#gain"/);
  assert.match(index, /href="simulations\.html#faq"/);
  assert.deepEqual(roi.validerDonnees(data), { ok: true });
});

test('CA2 : calculerGain', () => {
  const r = roi.calculerGain(data, 'solo', 10);
  assert.deepEqual(r, { ok: true, gainParHa: 60, gainTotal: 600, coutAnnuel: 588, net: 12 });
  assert.equal(roi.calculerGain(data, 'solo', 0).gainTotal, 0);
  assert.equal(roi.calculerGain(data, 'premium', hyp.surfaceMax).gainTotal, 90 * hyp.surfaceMax);
  assert.equal(roi.calculerGain(data, 'inconnue', 5).ok, false);
  assert.equal(roi.calculerGain(data, 'solo', -1).ok, false);
  assert.equal(roi.calculerGain(data, 'solo', NaN).ok, false);
});

test('CA2 : parseSurface', () => {
  assert.deepEqual(roi.parseSurface('12,5', hyp), { ok: true, valeur: 12.5 });
  assert.deepEqual(roi.parseSurface(' 20 ', hyp), { ok: true, valeur: 20 });
  assert.equal(roi.parseSurface(String(hyp.surfaceMin), hyp).ok, true);
  for (const v of ['', undefined, null, 'abc', '-3', '0', '5000']) assert.equal(roi.parseSurface(v, hyp).ok, false, String(v));
});

test('CA2 : formaterEuros', () => {
  assert.match(roi.formaterEuros(1234).replace(/\s/g, ' '), /^1 234 €$/);
  assert.match(roi.formaterEuros(0), /^0\s€$/);
});

test('CA3 : FAQ', () => {
  assert.ok(data.faq.length >= 3);
  for (const f of data.faq) assert.ok(f.question.trim() && f.reponse.trim());
  assert.match(html, /id="faq"/);
  assert.match(html, /id="faq-liste"/);
});

test('CA4 : mention indicative et validation des données', () => {
  assert.match(data.mention, /estimation indicative/i);
  assert.match(html, /estimation indicative/i);
  assert.doesNotMatch(JSON.stringify(data), /garanti/i);
  assert.equal(roi.validerDonnees(null).ok, false);
  assert.equal(roi.validerDonnees({}).ok, false);
  assert.equal(roi.validerDonnees({ mention: 'm', offres: [] }).ok, false);
  assert.equal(roi.validerDonnees({ mention: 'm', offres: [{}] }).ok, false);
  assert.equal(roi.validerDonnees({ ...data, hypotheses: {} }).ok, false);
  assert.equal(roi.validerDonnees({ ...data, mention: '' }).ok, false);
  assert.equal(roi.validerDonnees({ ...data, faq: undefined }).ok, false);
  assert.equal(roi.validerDonnees({ ...data, offres: [{ id: 'x', nom: 'X', prixMensuelHT: -1 }] }).ok, false);
  assert.equal(roi.validerDonnees({ ...data, hypotheses: { ...hyp, gainParHa: {} } }).ok, false);
});

test('CA5 : ressources locales, sans URL externe ni stockage', () => {
  for (const s of ['roi.js', 'offres.js']) {
    assert.ok(existsSync(join(docs, s)));
    assert.match(html, new RegExp(`<script src="${s}" defer>`));
    assert.doesNotMatch(read(s), /https?:\/\/|document\.cookie|localStorage/);
  }
  assert.doesNotMatch(read('data/offres.json'), /https?:\/\//);
});

function fakeDom() {
  const mk = tag => ({
    tag, children: [], hidden: false, disabled: true, value: '', textContent: '', className: '', listeners: {},
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  const ids = {};
  for (const id of ['offres', 'offres-erreur', 'offres-grille', 'faq-liste', 'roi-form', 'roi-surface', 'roi-offre', 'roi-resultat']) ids[id] = mk(id);
  return { ids, document: { getElementById: id => ids[id] ?? null, createElement: mk } };
}

async function lancer(reponse, dom = fakeDom()) {
  const ctx = {
    document: dom.document, window: { OleaRoi: roi }, Object, Promise,
    fetch: () => reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse)
  };
  vm.runInNewContext(read('offres.js'), ctx);
  await new Promise(r => setTimeout(r, 10));
  return dom.ids;
}

test('offres.js : rendu, calcul et validation', async () => {
  const ids = await lancer({ ok: true, json: async () => data });
  assert.equal(ids['offres-grille'].children.length, 3);
  assert.equal(ids['faq-liste'].children.length, data.faq.length);
  assert.equal(ids['roi-offre'].children.length, 3);
  assert.equal(ids['roi-surface'].value, hyp.surfaceDefaut);
  ids['roi-offre'].value = 'premium';
  ids['roi-surface'].value = '10';
  ids['roi-form'].listeners.submit({ preventDefault() {} });
  assert.match(ids['roi-resultat'].textContent, /90 €\/ha.*estimation indicative/);
  ids['roi-surface'].value = 'abc';
  ids['roi-form'].listeners.submit();
  assert.equal(ids['offres-erreur'].hidden, false);
  assert.equal(ids['roi-resultat'].textContent, '');
  ids['roi-surface'].value = '10';
  ids['roi-offre'].value = 'zzz';
  ids['roi-form'].listeners.submit();
  assert.equal(ids['offres-erreur'].textContent, 'Offre inconnue.');
});

test('offres.js : repli accessible en cas d\'échec', async () => {
  for (const rep of [{ ok: false, status: 500 }, new Error('réseau'), { ok: true, json: async () => ({}) }]) {
    const ids = await lancer(rep);
    assert.equal(ids['offres-erreur'].hidden, false);
    assert.match(ids['offres-erreur'].textContent, /momentanément indisponibles/);
  }
});

test('offres.js : sans #offres, ne fait rien', async () => {
  let appele = false;
  const ctx = { document: { getElementById: () => null }, window: { OleaRoi: roi }, fetch: () => { appele = true; } };
  vm.runInNewContext(read('offres.js'), ctx);
  assert.equal(appele, false);
});
