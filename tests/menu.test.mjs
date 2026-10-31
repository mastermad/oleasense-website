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
const nav = html.match(/<nav id="menu-principal"[\s\S]*?<\/nav>/)[0];
const panelOf = name => html.match(new RegExp(`<div id="mega-${name}"[\\s\\S]*?<\\/ul>\\s*<\\/div>\\s*(?:<div class="mega-col"[\\s\\S]*?<\\/ul>\\s*<\\/div>\\s*)*<\\/div>`))[0];
const panels = Object.fromEntries(['solutions', 'produits', 'simulations'].map(name => [name, panelOf(name)]));
const linksOf = panel => [...panel.matchAll(/<a class="mega-link" href="([^"]+)">[\s\S]*?<strong>([^<]+)<\/strong>/g)].map(match => ({ href: match[1], label: match[2] }));
const anchorExists = href => {
  const [page, id] = href.split('#');
  return (page === 'simulations.html' ? read('simulations.html') : html).includes(`id="${id}"`);
};

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

test('shouldCloseOnFocusout : jamais si le focus est inconnu ou interne', () => {
  const inside = {};
  const container = { contains: node => node === inside };
  assert.equal(menu.shouldCloseOnFocusout(null, container), false);
  assert.equal(menu.shouldCloseOnFocusout(undefined, container), false);
  assert.equal(menu.shouldCloseOnFocusout(inside, container), false);
  assert.equal(menu.shouldCloseOnFocusout({}, container), true);
});

test('shouldCloseOnFocusout : le passage vers un autre sous-menu du même menu ne ferme pas', () => {
  const nav = { contains: node => node === 'produits-bouton' || node === 'solutions-bouton' };
  assert.equal(menu.shouldCloseOnFocusout('produits-bouton', nav), false);
  assert.equal(menu.shouldCloseOnFocusout('hors-menu', nav), true);
});

test('afterClick : un menu ouvert au survol devient persistant, sinon le clic bascule', () => {
  assert.deepEqual(menu.afterClick({ open: true, byHover: true }), { open: true, byHover: false });
  assert.deepEqual(menu.afterClick({ open: true, byHover: false }), { open: false, byHover: false });
  assert.deepEqual(menu.afterClick({ open: false, byHover: false }), { open: true, byHover: false });
  assert.deepEqual(menu.afterClick(undefined), { open: true, byHover: false });
});

test('shouldAutoClose : seulement pour un menu ouvert au survol', () => {
  assert.equal(menu.shouldAutoClose({ open: true, byHover: true }), true);
  assert.equal(menu.shouldAutoClose({ open: true, byHover: false }), false);
  assert.equal(menu.shouldAutoClose({ open: false, byHover: true }), false);
  assert.equal(menu.shouldAutoClose(null), false);
});

test('openOnly : un seul sous-menu ouvert, hors bornes tous fermés', () => {
  assert.deepEqual(menu.openOnly(3, 1), [false, true, false]);
  assert.deepEqual(menu.openOnly(3, -1), [false, false, false]);
  assert.deepEqual(menu.openOnly(0, 0), []);
  assert.deepEqual(menu.openOnly(undefined, 0), []);
});

test('createCloser : fermeture après 250 ms, annulable, reprogrammable', () => {
  assert.equal(menu.CLOSE_DELAY, 250);
  const calls = [];
  let nextId = 0;
  const pending = new Map();
  const timers = {
    set: (callback, ms) => { nextId += 1; pending.set(nextId, { callback, ms }); return nextId; },
    clear: id => pending.delete(id)
  };
  let closed = 0;
  const closer = menu.createCloser(() => { closed += 1; }, undefined, timers);
  closer.cancel();
  assert.equal(closer.isPending(), false);
  closer.schedule();
  assert.equal(closer.isPending(), true);
  assert.equal([...pending.values()][0].ms, 250);
  closer.schedule();
  assert.equal(pending.size, 1);
  closer.cancel();
  assert.equal(pending.size, 0);
  assert.equal(closed, 0);
  closer.schedule();
  [...pending.values()][0].callback();
  assert.equal(closed, 1);
  assert.equal(closer.isPending(), false);
  const custom = menu.createCloser(() => calls.push('x'), 40, timers);
  custom.schedule();
  assert.equal([...pending.values()].at(-1).ms, 40);
});

test('createCloser : minuteries globales par défaut', async () => {
  let closed = 0;
  const closer = menu.createCloser(() => { closed += 1; }, 1);
  closer.schedule();
  closer.cancel();
  closer.schedule();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(closed, 1);
});

test('CA1 : trois sous-menus Solutions, Produits et Simulations, plus À propos', () => {
  assert.equal((nav.match(/<li class="has-mega">/g) || []).length, 3);
  for (const name of ['solutions', 'produits', 'simulations']) assert.ok(ids.includes(`mega-${name}`), name);
  assert.match(nav, /<li><a href="a-propos\.html">À propos<\/a><\/li>/);
  assert.deepEqual(linksOf(panels.solutions).map(link => link.label), ['Ce que la lumière révèle', "Du verger à l'huile", 'Timing de récolte', 'Traçabilité']);
  assert.deepEqual(linksOf(panels.produits).map(link => link.label), ['OleaSense Field', 'OleaSense Mill', 'OleaSense Bridge', 'Application', 'Pour qui', 'Offres']);
  assert.deepEqual(linksOf(panels.simulations).map(link => link.label), ['Comparaison de trois stratégies de récolte', 'Estimer votre gain', 'Questions fréquentes']);
  assert.doesNotMatch(html, /pont agro-huilerie/i);
});

test('CA1 : chaque lien des panneaux pointe vers une ancre existante', () => {
  for (const panel of Object.values(panels)) {
    for (const link of linksOf(panel)) {
      assert.match(link.href, /^(index|simulations)\.html#/);
      assert.ok(anchorExists(link.href), `ancre manquante : ${link.href}`);
    }
  }
});

test('CA2 : sans JavaScript, chaque libellé pointe vers sa première option', () => {
  assert.match(html, /<a id="solutions-lien" href="index\.html#lumiere">Solutions<\/a>/);
  assert.match(html, /<a id="produits-lien" href="index\.html#solution-field">Produits<\/a>/);
  assert.match(html, /<a id="simulations-lien" href="simulations\.html#comparaison">Simulations<\/a>/);
  assert.match(css, /\.js \.mega-toggle \{ display: inline-flex/);
  assert.match(css, /\.mega-toggle \{ display: none/);
  assert.match(script, /classList\.add\('js'\)/);
});

test('CA3 : boutons avec aria-expanded et aria-controls valides, panneaux masqués', () => {
  for (const name of ['solutions', 'produits', 'simulations']) {
    const button = html.match(new RegExp(`<button id="${name}-bouton"[^>]*>`))[0];
    assert.match(button, /aria-expanded="false"/);
    assert.match(button, /type="button"/);
    assert.ok(ids.includes(button.match(/aria-controls="([^"]+)"/)[1]));
    assert.match(panels[name], /^<div id="mega-[a-z]+" class="mega-panel" hidden>/);
  }
  assert.match(script, /event\.key !== 'Escape'/);
  assert.match(script, /\(hover: hover\) and \(min-width: 1024px\)/);
  assert.match(script, /OleaMenu\.CLOSE_DELAY/);
});

test('CA3 : le focus reste visible', () => {
  assert.match(css, /:focus-visible \{ outline: 3px solid/);
});

test('CA4 : panneau pleine largeur ancré sur l\'en-tête, pont de survol et accordéon mobile', () => {
  assert.match(css, /\.header-inner \{ position: static; \}/);
  assert.match(css, /\.mega-panel \{ position: absolute; left: 0; right: 0; top: 100%/);
  assert.match(css, /\.mega-panel::before \{ content: ""/);
  const mobile = css.match(/@media \(max-width: 1023px\) \{[\s\S]*?\n\}/)[0];
  assert.match(mobile, /\.mega-panel \{ position: static/);
  assert.match(mobile, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.mega-panel \{ animation: none; \}/);
});

test('CA5 : bouton de démonstration dans l\'en-tête, hors du menu repliable', () => {
  const header = html.match(/<header class="site-header"[\s\S]*?<\/header>/)[0];
  assert.match(header, /<a class="button button-small header-cta" href="#contact">Demander une démonstration<\/a>/);
  assert.doesNotMatch(nav, /Demander une démonstration/);
  assert.ok(ids.includes('contact'));
  assert.match(css, /\.header-cta \{ order: 3; flex: none; margin-left: auto; \}/);
});

test('CA6 : ids uniques', () => {
  assert.equal(new Set(ids).size, ids.length);
});

test('CA6 : scripts menu avant script.js, versions de cache à jour, aucune ressource externe', () => {
  assert.ok(html.indexOf('menu.js?v=2') > -1 && html.indexOf('menu.js?v=2') < html.indexOf('script.js?v=11'));
  assert.match(html, /styles\.css\?v=13/);
  assert.doesNotMatch(read('menu.js'), /https?:\/\//);
  for (const name of ['consent.js', 'lead.js', 'conversion.js']) assert.ok(read(name).length > 0);
});

test('CA3 à CA5 : destinations exactes de chaque sous-menu', () => {
  assert.deepEqual(linksOf(panels.solutions).map(link => link.href), ['index.html#lumiere', 'index.html#parcours', 'index.html#recolte', 'index.html#tracabilite']);
  assert.deepEqual(linksOf(panels.produits).map(link => link.href), ['index.html#solution-field', 'index.html#solution-mill', 'index.html#solution-bridge', 'index.html#application', 'index.html#utilisateurs', 'index.html#offres']);
  assert.deepEqual(linksOf(panels.simulations).map(link => link.href), ['simulations.html#comparaison', 'simulations.html#gain', 'simulations.html#faq']);
});

test('CA6 : chaque option du menu a une icône, un titre et une description', () => {
  const defined = new Set([...html.matchAll(/<symbol id="(i-[a-z-]+)"/g)].map(match => match[1]));
  for (const panel of Object.values(panels)) {
    const options = panel.match(/<a class="mega-link"[\s\S]*?<\/a>/g) ?? [];
    assert.ok(options.length > 0);
    for (const option of options) {
      const icon = option.match(/<svg class="icon" aria-hidden="true"><use href="#(i-[a-z-]+)"\/><\/svg>/);
      assert.ok(icon && defined.has(icon[1]), option);
      assert.match(option, /<span class="mega-text"><strong>[^<]+<\/strong><span>[^<]+<\/span><\/span>/);
    }
  }
});

test('CA2 et CA4 : burger et accordéon sous 1024 px, survol réservé aux écrans larges', () => {
  const mobile = css.match(/@media \(max-width: 1023px\) \{[\s\S]*?\n\}/)[0];
  assert.match(mobile, /\.nav-toggle \{ display: inline-flex; \}/);
  assert.match(mobile, /\.main-nav \{ position: absolute;[^}]*display: none; \}/);
  assert.match(mobile, /\.main-nav\.is-open \{ display: block; \}/);
  assert.match(mobile, /\.main-nav ul \{ flex-direction: column;/);
  assert.match(mobile, /\.main-nav \.mega-panel ul \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(script, /\(hover: hover\) and \(min-width: 1024px\)/);
});
