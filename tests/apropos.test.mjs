import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const read = name => readFileSync(join(docs, name), 'utf8');
const html = read('a-propos.html');
const section = id => new RegExp(`<section id="${id}"[\\s\\S]*?</section>`).exec(html)?.[0] ?? '';

test('CA1 : mission et ancrage territorial sans territoire hors dépôt', () => {
  assert.match(section('mission'), /Fleury-les-Aubrais/);
  assert.doesNotMatch(html, /Tunisie/);
  assert.match(read('mentions-legales.html'), /Fleury-les-Aubrais/);
});

test('Lisibilité : intro À propos sur fond clair, .lead du hero inchangé', () => {
  const css = read('styles.css');
  assert.match(html, /<p class="lead apropos-lead">/);
  assert.match(css, /\.lead\.apropos-lead\s*\{\s*color:\s*var\(--muted\);\s*\}/);
  assert.match(css, /\.lead\s*\{[^}]*rgba\(255, 255, 255, \.92\)/);
});

test('CA2 : méthodologie en étapes, mention indicative', () => {
  const methodo = section('methodologie');
  assert.ok((methodo.match(/<li>/g) ?? []).length >= 3);
  assert.match(methodo, /indicatif/);
});

test('CA3 : formulaire de contact mailto avec champs étiquetés et requis', () => {
  const form = /<form id="form-contact"[\s\S]*?<\/form>/.exec(html)?.[0] ?? '';
  assert.match(form, /action="mailto:contact@oleasense\.com"/);
  const fields = [...form.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map(m => m[0]);
  assert.equal(fields.length, 3);
  for (const field of fields) {
    const id = /\sid="([^"]+)"/.exec(field)?.[1];
    assert.ok(id && form.includes(`<label for="${id}">`), `label manquant pour ${id}`);
    assert.match(field, /\srequired\b/);
  }
  assert.match(form, /type="submit"/);
  assert.doesNotMatch(form, /https?:\/\//);
  assert.doesNotMatch(html, /fetch\(/);
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
  assert.equal(scripts.length, 2);
  for (const tag of scripts) assert.match(tag, /^<script src="(menu|script)\.js\?v=\d+" defer>$/);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]+<\/script>/);
});

test('CA4 : équipe issue des mentions légales, sans image', () => {
  const equipe = section('equipe');
  assert.match(equipe, /Mohamed Ben Soltana/);
  assert.match(equipe, /Président/);
  assert.doesNotMatch(equipe, /<img/);
  assert.match(read('mentions-legales.html'), /Mohamed Ben Soltana, Président/);
});

test('CA5 : navigation, sitemap, aucun stockage ni traceur', () => {
  const index = read('index.html');
  assert.equal((index.match(/href="a-propos\.html"/g) ?? []).length, 2);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/oleasense\.com\/a-propos\.html<\/loc>/);
  assert.doesNotMatch(html, /cookie|localStorage|sessionStorage/i);
  assert.match(html, /styles\.css\?v=12/);
  assert.match(index, /styles\.css\?v=12/);
});
