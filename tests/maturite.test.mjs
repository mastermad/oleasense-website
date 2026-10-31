import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const require = createRequire(import.meta.url);
const m = require(join(docs, 'maturite.js'));
const html = readFileSync(join(docs, 'simulations.html'), 'utf8');

test('CA2 : courbes monotones et bornées', () => {
  assert.ok(m.oilCurve(0) < m.oilCurve(30) && m.oilCurve(30) < m.oilCurve(60));
  assert.ok(m.phenolAcidCurve(0) > m.phenolAcidCurve(30) && m.phenolAcidCurve(30) > m.phenolAcidCurve(60));
  for (const t of [-10, 0, 60, 100]) {
    assert.ok(m.oilCurve(t) >= 0 && m.oilCurve(t) <= 100);
    assert.ok(m.phenolAcidCurve(t) >= 0 && m.phenolAcidCurve(t) <= 100);
  }
  assert.equal(m.oilCurve(-5), m.oilCurve(0));
});

test('CA2 : croisement et fenêtre de 7 jours', () => {
  const c = m.crossingPoint();
  assert.ok(Math.abs(m.oilCurve(c.t) - m.phenolAcidCurve(c.t)) < 1e-6);
  assert.ok(c.value > 0 && c.value < 100);
  assert.ok(Math.abs(c.t - 31) < 1e-6);
  const w = m.optimalWindow();
  assert.equal(w.end - w.start, 7);
  assert.ok(w.start <= c.t && c.t <= w.end);
  assert.ok(w.start >= 0 && w.end <= m.MAX_DAY);
  assert.deepEqual(m.optimalWindow(undefined), w);
  assert.equal(m.optimalWindow(1000).end, m.MAX_DAY);
  assert.equal(m.optimalWindow(-3).end - m.optimalWindow(-3).start, 0);
});

test('CA2 : stateAt aux bornes', () => {
  const w = m.optimalWindow();
  assert.equal(m.stateAt(0).phase, 'precoce');
  assert.equal(m.stateAt(w.start - 1).phase, 'precoce');
  assert.equal(m.stateAt(w.start).phase, 'optimale');
  assert.equal(m.stateAt(String(w.end)).phase, 'optimale');
  assert.equal(m.stateAt(w.end + 1).phase, 'tardive');
  assert.equal(m.stateAt(500).day, m.MAX_DAY);
  assert.equal(m.stateAt('abc').day, 0);
  const s = m.stateAt(10);
  assert.match(s.valuetext, /^Jour 10 : /);
  for (const d of [0, 31, 60]) assert.doesNotMatch(m.stateAt(d).text, /garanti/i);
  assert.equal(m.stateAt(31).oil, Math.round(m.oilCurve(31)));
});

test('CA2 : draw et init avec un DOM minimal', () => {
  const made = [];
  const mk = (name) => {
    const node = { name, attrs: {}, children: [], textContent: '', className: '', listeners: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(c) { this.children.push(c); },
      addEventListener(e, f) { this.listeners[e] = f; } };
    made.push(node);
    return node;
  };
  const els = { 'maturite-svg': mk('svg'), 'maturite-curseur': Object.assign(mk('input'), { value: '10' }),
    'maturite-message': mk('p'), 'maturite-badge': mk('p'), 'recolte-cta': mk('a') };
  const doc = { createElementNS: (ns, name) => mk(name), getElementById: id => els[id] || null };
  m.init(doc);
  assert.equal(els['recolte-cta'].attrs.href, m.CTA_TARGET);
  assert.ok(els['maturite-svg'].children.length > 5);
  assert.equal(els['maturite-badge'].textContent, 'Récolte précoce');
  assert.match(els['maturite-message'].textContent, /illustration/);
  els['maturite-curseur'].value = '31';
  els['maturite-curseur'].listeners.input();
  assert.equal(els['maturite-badge'].textContent, 'Fenêtre optimale visée');
  assert.equal(els['maturite-badge'].className, 'badge');
  assert.match(els['maturite-curseur'].attrs['aria-valuetext'], /Jour 31/);
  assert.doesNotThrow(() => m.init({ getElementById: () => null }));
});

test('CA2 : draw déplace le marqueur et init signale les phases non optimales', () => {
  const mk = (name) => ({ name, attrs: {}, children: [], textContent: '', className: '', listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); },
    addEventListener(e, f) { this.listeners[e] = f; } });
  const doc = { createElementNS: (ns, name) => mk(name) };
  const svg = mk('svg');
  const move = m.draw(doc, svg);
  const marker = svg.children.find((c) => c.attrs.id === 'maturite-marqueur');
  move(0);
  assert.equal(marker.attrs.x1, 50);
  move(1000);
  assert.equal(marker.attrs.x2, 620);
  assert.ok(svg.children.some((c) => c.attrs.id === 'maturite-croisement'));

  const els = { 'maturite-svg': mk('svg'), 'maturite-curseur': Object.assign(mk('input'), { value: '55' }),
    'maturite-message': mk('p'), 'maturite-badge': mk('p') };
  m.init({ createElementNS: doc.createElementNS, getElementById: (id) => els[id] || null });
  assert.equal(els['maturite-badge'].className, 'badge is-moderate');
  assert.equal(els['maturite-badge'].textContent, 'Récolte tardive');
});

test('CA4 : cible du bouton définie une seule fois (page Simulations : contact sur l\'accueil)', () => {
  assert.equal(m.CTA_TARGET, 'index.html#contact');
  assert.match(html, /id="recolte-cta" href="index\.html#contact"/);
  assert.match(html, /Tester l'estimation de récolte sur mon domaine/);
});

test('CA1/CA3/CA5 : contenu HTML de la comparaison (page Simulations)', () => {
  const section = html.slice(html.indexOf('id="comparaison"'), html.indexOf('id="gain"'));
  for (const mot of ['0,8 %', 'Illustration pédagogique', 'matrice-recolte', 'maturite-svg', 'maturite-curseur']) {
    assert.ok(section.includes(mot), mot);
  }
  assert.match(section, /<h2 id="titre-comparaison"/);
  assert.match(section, /<caption>/);
  assert.equal((section.match(/<th scope="col">/g) || []).length, 3);
  assert.equal((section.match(/<th scope="row">/g) || []).length, 3);
  assert.doesNotMatch(section, /garanti/i);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /<script src="maturite\.js" defer><\/script>/);
});

test('CA1 : la section récolte de l\'accueil garde le texte et renvoie vers la comparaison', () => {
  const index = readFileSync(join(docs, 'index.html'), 'utf8');
  const section = index.slice(index.indexOf('id="recolte"'), index.indexOf('id="solutions"'));
  for (const mot of ['PRISMA', 'EnMAP', 'Sentinel-2', 'Comparer les trois stratégies']) assert.ok(section.includes(mot), mot);
  assert.match(section, /<h2 id="titre-recolte"/);
  assert.match(section, /href="simulations\.html#comparaison"/);
  assert.doesNotMatch(section, /matrice-recolte|maturite-svg/);
});
