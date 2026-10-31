import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const require = createRequire(import.meta.url);
const menu = require(join(docs, 'menu.js'));
const read = name => readFileSync(join(docs, name), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const script = read('script.js');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const panel = html.match(/<div id="mega-solutions"[\s\S]*?<\/ul>\s*<\/div>\s*<\/div>\s*<\/li>/)[0];
const nav = html.match(/<nav id="menu-principal"[\s\S]*?<\/nav>/)[0];
const panelLinks = [...panel.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(match => ({ href: match[1], label: match[2] }));

test('nextState : toggle, open, fermetures et évènement inconnu', () => {
  assert.equal(menu.nextState(false, 'toggle'), true);
  assert.equal(menu.nextState(true, 'toggle'), false);
  assert.equal(menu.nextState(false, 'open'), true);
  for (const event of ['close', 'escape', 'outside', 'focusout']) assert.equal(menu.nextState(true, event), false);
  assert.equal(menu.nextState(true, 'inconnu'), true);
  assert.equal(menu.nextState(undefined, 'inconnu'), false);
});

test('isOutside : cible absente, interne et externe', () => {
  const inside = {};
  const container = { contains: node => node === inside };
  assert.equal(menu.isOutside(null, container), true);
  assert.equal(menu.isOutside(inside, null), true);
  assert.equal(menu.isOutside(inside, container), false);
  assert.equal(menu.isOutside({}, container), true);
});

test('nextIndex : flèches circulaires, Début, Fin, liste vide', () => {
  assert.equal(menu.nextIndex(0, 3, 'ArrowDown'), 1);
  assert.equal(menu.nextIndex(2, 3, 'ArrowRight'), 0);
  assert.equal(menu.nextIndex(0, 3, 'ArrowUp'), 2);
  assert.equal(menu.nextIndex(2, 3, 'ArrowLeft'), 1);
  assert.equal(menu.nextIndex(-1, 3, 'ArrowUp'), 2);
  assert.equal(menu.nextIndex(1, 3, 'Home'), 0);
  assert.equal(menu.nextIndex(1, 3, 'End'), 2);
  assert.equal(menu.nextIndex(1, 3, 'a'), 1);
  assert.equal(menu.nextIndex(0, 0, 'ArrowDown'), -1);
});

test('CA1 : le panneau expose Domaines, Huileries et Coopératives', () => {
  for (const title of ['Domaines', 'Huileries', 'Coopératives']) assert.match(panel, new RegExp(`class="mega-titre"[^>]*>${title}<`));
  assert.equal((panel.match(/class="mega-col"/g) || []).length, 3);
  for (const label of ['OleaSense Field', 'OleaSense Mill', 'Le pont agro-huilerie']) assert.ok(panelLinks.some(link => link.label === label), label);
});

test('CA1 : chaque lien du panneau pointe vers une ancre existante', () => {
  assert.ok(panelLinks.length >= 9);
  for (const link of panelLinks) {
    assert.match(link.href, /^#/);
    assert.ok(ids.includes(link.href.slice(1)), `ancre manquante : ${link.href}`);
  }
});

test('CA2 : le lien Solutions reste une ancre #solutions sans JavaScript', () => {
  assert.match(html, /<li class="has-mega">\s*<a id="solutions-lien" href="#solutions">Solutions<\/a>/);
  assert.ok(ids.includes('solutions'));
  assert.match(css, /\.js \.mega-toggle \{ display: inline-flex/);
  assert.match(css, /\.mega-toggle \{ display: none/);
  assert.match(script, /classList\.add\('js'\)/);
});

test('CA3 : bouton avec aria-expanded et aria-controls valides, panneau masqué', () => {
  const button = html.match(/<button id="solutions-bouton"[^>]*>/)[0];
  assert.match(button, /aria-expanded="false"/);
  assert.match(button, /type="button"/);
  const controls = button.match(/aria-controls="([^"]+)"/)[1];
  assert.ok(ids.includes(controls));
  assert.match(panel, /^<div id="mega-solutions" class="mega-panel" hidden>/);
  assert.match(script, /event\.key !== 'Escape'/);
  assert.match(script, /megaButton\.focus\(\)/);
  assert.match(script, /OleaMenu\.nextState\(true, 'outside'\)/);
  assert.match(script, /\(hover: hover\) and \(min-width: 1101px\)/);
});

test('CA3 : le focus reste visible', () => {
  assert.match(css, /:focus-visible \{ outline: 3px solid/);
});

test('CA4 : accordéon mobile à trois niveaux maximum, sans débordement', () => {
  const mobile = css.match(/@media \(max-width: 1100px\) \{[\s\S]*?\n\}/)[0];
  assert.match(mobile, /\.mega-panel \{ position: static/);
  assert.match(mobile, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.mega-panel \{ position: absolute[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  // niveau 1 : Solutions, niveau 2 : groupe, niveau 3 : lien
  assert.equal((panel.match(/<ul>/g) || []).length, 3);
  assert.equal((panel.match(/<\/ul>/g) || []).length, 3);
});

test('CA5 : bouton de démonstration dans l\'en-tête, hors du menu repliable', () => {
  const header = html.match(/<header class="site-header"[\s\S]*?<\/header>/)[0];
  assert.match(header, /<a class="button button-small header-cta" href="#contact">Demander une démonstration<\/a>/);
  assert.doesNotMatch(nav, /Demander une démonstration/);
  assert.ok(ids.includes('contact'));
  assert.match(css, /\.header-cta \{ margin-left: auto/);
});

test('CA6 : ids uniques et autres entrées du menu conservées', () => {
  assert.equal(new Set(ids).size, ids.length);
  const links = [...nav.replace(panel, '').matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map(match => `${match[1]}|${match[2]}`);
  assert.deepEqual(links, [
    '#lumiere|La lumière', '#recolte|Timing de récolte', "#parcours|Du verger à l'huile",
    '#application|Application', '#utilisateurs|Pour qui', '#offres|Offres', 'a-propos.html|À propos'
  ]);
});

test('CA4/CA5 : pas de débordement horizontal de l\'en-tête ni sur bureau ni à 375 px', () => {
  assert.match(css, /\.main-nav \{ order: 2; min-width: 0; flex: 1 1 auto; \}/);
  assert.match(css, /\.main-nav ul \{ display: flex; flex-wrap: wrap; justify-content: flex-end;/);
  const mobile = css.match(/@media \(max-width: 1100px\) \{[\s\S]*?\n\}/)[0];
  assert.match(mobile, /\.main-nav ul \{ flex-direction: column; flex-wrap: nowrap;/);
  const compact = css.match(/@media \(max-width: 520px\) \{[\s\S]*?\n\}/)[0];
  assert.match(compact, /\.header-cta \{ flex: 0 1 auto;/);
});

test('CA6 : scripts menu avant script.js, versions de cache à jour, aucune ressource externe', () => {
  assert.ok(html.indexOf('menu.js?v=1') > -1 && html.indexOf('menu.js?v=1') <   html.indexOf('script.js?v=10'));
    assert.match(html, /styles\.css\?v=11/);
  assert.doesNotMatch(read('menu.js'), /https?:\/\//);
  for (const name of ['consent.js', 'lead.js', 'conversion.js']) assert.ok(read(name).length > 0);
});
