import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const read = name => readFileSync(join(docs, name), 'utf8');
const html = read('index.html');
const section = /<section id="sous-le-capot"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
const text = section.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('Sous le capot : section liée à son titre unique, placée avant le contact', () => {
  assert.match(section, /aria-labelledby="titre-capot"/);
  assert.equal(section.match(/<h2 /g)?.length, 1);
  assert.match(section, /<h2 id="titre-capot">/);
  assert.equal(html.match(/id="sous-le-capot"/g)?.length, 1);
  assert.ok(html.indexOf('id="sous-le-capot"') < html.indexOf('id="contact"'));
  assert.equal(html.match(/<h1[ >]/g)?.length, 1);
});

test('Sous le capot : quatre étapes ordonnées, de la collecte à la restitution', () => {
  const steps = [...section.matchAll(/<li class="reveal">\s*<span class="step-badge">(\d)<\/span>\s*<h3>([^<]+)<\/h3>/g)];
  assert.deepEqual(steps.map(s => s[1]), ['1', '2', '3', '4']);
  assert.deepEqual(steps.map(s => s[2]), ['Collecter', 'Traiter', 'Confronter', 'Calibrer et restituer']);
  assert.match(section, /<ol class="journey-steps">/);
});

test('Sous le capot : vocabulaire simple, sans jargon ni promesse chiffrée', () => {
  for (const mot of ['satellite', 'hyperspectrales', 'météo', 'mesures de terrain']) {
    assert.ok(text.includes(mot), `mot manquant : ${mot}`);
  }
  assert.doesNotMatch(text, /Sentinel|Landsat|EnMAP|EMIT|Jaén|potentiel hydrique|chlorophylle|pixel|SMS|API/);
  const prose = text.replace(/\bSentinel-2\b/g, '').replace(/ [1-4] (?=[A-Z])/g, ' ');
  assert.doesNotMatch(prose, /\d/);
  assert.doesNotMatch(text, /%/);
  assert.match(text, /n'est pas un diagnostic/);
});

test('Sous le capot : aucun pays unique ni concurrent nommé, aucune ressource externe', () => {
  assert.doesNotMatch(section, /Tunisi|Maroc|Alg[ée]ri|Espagne|Robocare/i);
  assert.doesNotMatch(section, /(?:src|href)="https?:/);
});

test('Sous le capot : style réutilisant les jetons du site', () => {
  const css = read('styles.css');
  assert.match(css, /\.capot-note\s*\{[^}]*var\(--space-6\)/);
  assert.doesNotMatch(/\.capot-note\s*\{[^}]*\}/.exec(css)?.[0] ?? '', /#[0-9a-f]{3,6}/i);
});
