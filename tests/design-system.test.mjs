import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, luminance, parseHex } from './contrast.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const read = name => readFileSync(join(root, name), 'utf8');
const css = read('styles.css');
const pageNames = ['index.html', 'simulations.html', 'a-propos.html', 'mentions-legales.html', 'politique-confidentialite.html', 'confirmation.html', '404.html'];

const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const variables = Object.fromEntries([...rootBlock.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)].map(m => [m[1], m[2].trim()]));
const color = name => variables[name];

test('contrast : utilitaires WCAG', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.deepEqual(parseHex('#123d2e'), [18, 61, 46]);
  assert.throws(() => parseHex('#zzz'), /couleur invalide/);
  assert.equal(luminance('#ffffff'), 1);
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#808080') > 0.2 && luminance('#808080') < 0.25, true);
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.001);
  assert.equal(contrastRatio('#ffffff', '#000000'), contrastRatio('#000000', '#ffffff'));
});

test('design system : variables CSS attendues dans :root', () => {
  const expected = [
    'deep', 'deeper', 'olive', 'spectral', 'teal', 'gold', 'cream', 'tint', 'ink', 'muted', 'surface', 'surface-alt',
    'fs-xs', 'fs-sm', 'fs-md', 'fs-lg', 'fs-xl', 'fs-2xl', 'lh-tight', 'lh-body',
    'space-1', 'space-2', 'space-3', 'space-4', 'space-5', 'space-6', 'space-7', 'space-8',
    'radius-sm', 'radius-md', 'radius-lg', 'radius', 'shadow-soft', 'shadow-raised', 'shadow', 'font', 'focus', 'focus-ring'
  ];
  for (const name of expected) assert.ok(variables[name], `variable --${name} absente`);
});

test('design system : les variables sont utilisées par les composants', () => {
  for (const name of ['--fs-xl', '--fs-lg', '--lh-tight', '--space-3', '--shadow-soft', '--shadow-raised', '--surface', '--focus']) {
    assert.ok(css.includes(`var(${name})`), `${name} non utilisée`);
  }
});

test('hiérarchie visuelle : titres de section et cartes présents', () => {
  for (const selector of ['.section-head h2', '.section-head .lead', '.card-icon', '.card h3', '.card-tag', '.journey-steps h3']) {
    assert.ok(css.includes(selector), `${selector} manquant`);
  }
  const index = read('index.html');
  assert.ok(/class="[^"]*section-head/.test(index));
  assert.ok(/class="[^"]*\bcard\b/.test(index));
  assert.ok(/class="[^"]*journey/.test(index));
  assert.ok((index.match(/<h2\b/gi) ?? []).length >= 4);
});

test('contrastes AA : texte ≥ 4,5:1', () => {
  const pairs = [
    ['ink', 'cream'], ['muted', 'cream'], ['deep', 'cream'], ['teal', 'cream'], ['muted', 'surface'],
    ['muted', 'surface-alt'], ['ink', 'surface'], ['surface', 'deep'], ['surface', 'deeper'], ['surface', 'teal'], ['deeper', 'gold']
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrastRatio(color(fg), color(bg));
    assert.ok(ratio >= 4.5, `${fg} sur ${bg} : ${ratio.toFixed(2)}`);
  }
  for (const [fg, bg] of [['#0b5a43', '#e2f3ea'], ['#6b4a00', '#f6e2ac'], ['#8a1d0e', '#fbd9d3']]) {
    assert.ok(contrastRatio(fg, bg) >= 4.5, `badge ${fg} sur ${bg}`);
  }
});

test('contrastes AA : focus et contrôles ≥ 3:1', () => {
  assert.ok(contrastRatio(color('focus'), color('cream')) >= 3);
  assert.ok(contrastRatio(color('focus'), color('surface')) >= 3);
  assert.ok(contrastRatio(color('focus-ring'), color('deep')) >= 3);
  assert.ok(contrastRatio(color('teal'), color('surface')) >= 3);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
});

test('mouvement réduit : .reveal neutralisé', () => {
  const blocks = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? [];
  assert.ok(blocks.some(block => /\.reveal\s*\{[^}]*opacity:\s*1[^}]*transition:\s*none/.test(block)));
});

test('pages : feuille de style partagée à version identique', () => {
  const versions = pageNames.map(name => /styles\.css\?v=(\d+)/.exec(read(name))?.[1]);
  assert.ok(versions.every(Boolean), 'styles.css?v= manquant');
  assert.equal(new Set(versions).size, 1, `versions différentes : ${versions}`);
});

for (const name of pageNames) {
  test(`${name} : lien d'évitement, main ciblé et titres sans saut`, () => {
    const html = read(name);
    assert.match(html, /<a class="skip-link" href="#contenu">Aller au contenu<\/a>/);
    assert.match(html, /<main\b[^>]*\sid="contenu"/);
    const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(m => Number(m[1]));
    assert.equal(levels[0], 1);
    levels.forEach((level, i) => { if (i) assert.ok(level <= levels[i - 1] + 1, `saut de titre h${levels[i - 1]} → h${level}`); });
  });
}

test('aucune police ni framework externe dans le CSS', () => {
  assert.doesNotMatch(css, /https?:\/\/|@import/i);
  const fonts = readdirSync(join(root, 'assets', 'fonts'));
  assert.ok(fonts.some(file => file.endsWith('.woff2')));
});

test('pages : href de styles.css strict (chemin valide, sans espace parasite)', () => {
  for (const name of pageNames) {
    assert.match(read(name), /<link rel="stylesheet" href="\/?styles\.css\?v=\d+">/, `${name} : href de styles.css invalide`);
  }
});

test('skip-link : masqué puis ramené dans la page au focus clavier', () => {
  assert.match(css, /\.skip-link\s*\{[^}]*top:\s*-4rem/);
  assert.match(css, /\.skip-link:focus\s*\{[^}]*top:\s*1rem/);
});

test('contrôles : bouton principal et champs du formulaire à focus lisible', () => {
  assert.match(css, /\.button\s*\{[^}]*background:\s*var\(--deep\)/);
  assert.ok(contrastRatio(color('surface'), color('deep')) >= 4.5, 'texte du bouton sous 4,5:1');
  assert.match(css, /\.lead-form input:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
  assert.ok(contrastRatio(color('focus'), color('cream')) >= 3, 'focus sous 3:1 sur fond clair');
});

test('hiérarchie : sections lumière, récolte, solutions et parcours ont un h2, les solutions trois cartes', () => {
  const index = read('index.html');
  for (const id of ['lumiere', 'recolte', 'solutions', 'parcours']) {
    const section = new RegExp(`<section id="${id}"[\\s\\S]*?</section>`).exec(index)?.[0] ?? '';
    assert.ok(section, `section #${id} absente`);
    assert.match(section, /<h2\b/, `h2 absent dans #${id}`);
  }
  const solutions = /<section id="solutions"[\s\S]*?<\/section>/.exec(index)?.[0] ?? '';
  assert.equal((solutions.match(/<article\b[^>]*\bclass="card(?=[\s"])/g) ?? []).length, 3);
});
