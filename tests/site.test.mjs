import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const pages = walk(root).filter(file => file.endsWith('.html'));
const rel = file => file.slice(root.length + 1).replaceAll('\\', '/');

const attributes = (html, tag, attribute) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*?\\s${attribute}="([^"]*)"`, 'gi'))].map(match => match[1]);
const isLocal = value => value && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
const target = (page, value) => {
  const path = value.split(/[?#]/)[0];
  return path.startsWith('/') ? join(root, path) : resolve(dirname(page), path);
};

test('le site contient au moins une page', () => {
  assert.ok(pages.length > 0);
  assert.ok(existsSync(join(root, 'index.html')));
});

const headerOf = html => /<header class="site-header"[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
const readDoc = name => readFileSync(join(root, name), 'utf8');
const normalizeHeader = html => headerOf(html).replaceAll(/(href|src)="\//g, '$1="');

test('en-tête identique sur toutes les pages, 404 comprise (chemins racine normalisés)', () => {
  const reference = headerOf(readDoc('index.html'));
  assert.ok(reference.length > 0);
  for (const page of pages) assert.equal(normalizeHeader(readFileSync(page, 'utf8')), reference, rel(page));
});

test('en-tête : trois sous-menus, À propos et bouton de démonstration', () => {
  const header = headerOf(readDoc('index.html'));
  assert.equal((header.match(/class="has-mega"/g) ?? []).length, 3);
  for (const label of ['Solutions', 'Produits', 'Simulations', 'À propos', 'Demander une démonstration']) assert.ok(header.includes(`>${label}<`), label);
});

test('chaque page avec en-tête charge menu.js avant script.js et déclare les icônes utilisées', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.ok(html.search(/menu\.js\?v=2/) > -1 && html.search(/menu\.js\?v=2/) < html.search(/script\.js\?v=11/), rel(page));
    const defined = new Set([...html.matchAll(/<symbol id="(i-[a-z-]+)"/g)].map(match => match[1]));
    for (const used of html.matchAll(/<use href="#(i-[a-z-]+)"/g)) assert.ok(defined.has(used[1]), `${rel(page)} : ${used[1]}`);
  }
});

test('simulations.html : comparaison, gain et FAQ avec leurs scripts', () => {
  const html = readDoc('simulations.html');
  for (const id of ['comparaison', 'gain', 'faq', 'matrice-recolte', 'recolte-cta', 'roi-form', 'faq-liste', 'offres']) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const script of ['maturite.js', 'roi.js', 'offres.js']) assert.match(html, new RegExp(`<script src="${script}" defer>`));
  assert.match(html, /id="recolte-cta"[^>]*href="index\.html#contact"|href="index\.html#contact"[^>]*id="recolte-cta"/);
  assert.match(readDoc('sitemap.xml'), /<loc>https:\/\/oleasense\.com\/simulations\.html<\/loc>/);
});

test('index : Bridge renommé avec ancre de compatibilité, traçabilité et renvois', () => {
  const html = readDoc('index.html');
  assert.match(html, /OleaSense Bridge/);
  assert.doesNotMatch(html, /pont agro-huilerie/i);
  assert.match(html, /id="solution-pont"/);
  const trace = /<section id="tracabilite"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  for (const step of ['Parcelle', 'Remorque', 'Cuve', 'Certificat']) assert.ok(trace.includes(step), step);
  assert.match(trace, /id="tracabilite-cta"[^>]*href="#contact"/);
  assert.match(html, /id="recolte-renvoi"[^>]*href="simulations\.html#comparaison"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('simulations.html : config.js chargé avant les scripts de simulation', () => {
  const html = readDoc('simulations.html');
  assert.match(html, /<script src="config\.js" defer><\/script>/);
  assert.ok(html.indexOf('config.js') < html.indexOf('roi.js'));
  assert.ok(html.indexOf('config.js') < html.indexOf('offres.js'));
  assert.ok(existsSync(join(root, 'config.js')));
});

test('index : ancre Bridge et renvois vers les simulations depuis les offres', () => {
  const html = readDoc('index.html');
  assert.match(html, /<article id="solution-bridge"/);
  assert.match(html, /<span id="solution-pont"/);
  assert.match(html, /id="offres-renvoi-gain"[^>]*href="simulations\.html#gain"/);
  assert.match(html, /id="offres-renvoi-faq"[^>]*href="simulations\.html#faq"/);
});

test('simulations.html : ids uniques', () => {
  const ids = [...readDoc('simulations.html').matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

const css = readDoc('styles.css');
const rootVar = name => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

test('barres de défilement : règles globales uniques dans styles.css', () => {
  assert.equal((css.match(/scrollbar-width:\s*thin/g) ?? []).length, 1);
  assert.equal((css.match(/scrollbar-color:\s*var\(--scroll-thumb\) var\(--scroll-track\)/g) ?? []).length, 1);
  assert.match(css, /::-webkit-scrollbar\s*\{\s*width:\s*8px;\s*height:\s*8px;\s*\}/);
  assert.match(css, /::-webkit-scrollbar-track\s*\{\s*background:\s*var\(--scroll-track\)/);
  assert.match(css, /::-webkit-scrollbar-thumb\s*\{[^}]*background-clip:\s*padding-box;[^}]*border:\s*2px solid transparent;[^}]*border-radius:\s*999px/);
  assert.match(css, /::-webkit-scrollbar-button\s*\{\s*display:\s*none/);
  assert.equal(rootVar('scroll-track'), 'transparent');
});

test('barres de défilement : aucune redéfinition locale ni couleur en dur', () => {
  assert.doesNotMatch(readDoc('consent.css'), /scrollbar/);
  for (const page of pages) assert.doesNotMatch(readFileSync(page, 'utf8'), /scrollbar/, rel(page));
  const scrollRules = css.split('\n').filter(line => /scrollbar/.test(line) && !/^\s*(\/\*|\*|@supports)/.test(line));
  for (const line of scrollRules) assert.doesNotMatch(line, /#[0-9a-f]{3,6}\b|rgba?\(/i, line);
});

const alpha = value => Number(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(value)?.[1]);
const rgb = value => /rgba\((\d+),\s*(\d+),\s*(\d+)/.exec(value).slice(1, 4).map(Number);

test('barres de défilement : pouce translucide plus soutenu au survol, contraste ≥ 3:1', async () => {
  const { contrastRatio } = await import('./contrast.mjs');
  const thumb = rootVar('scroll-thumb');
  const hover = rootVar('scroll-thumb-hover');
  assert.ok(alpha(hover) > alpha(thumb));
  assert.ok(alpha(thumb) < 1);
  const cream = rootVar('cream');
  const base = rgb('rgba(250, 249, 245, 1)');
  const hex = ([r, g, b]) => `#${[r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  for (const value of [thumb, hover]) {
    const [r, g, b] = rgb(value);
    const a = alpha(value);
    const composite = [r, g, b].map((c, i) => c * a + base[i] * (1 - a));
    assert.ok(contrastRatio(hex(composite), cream) >= 3, value);
  }
  assert.match(css, /::-webkit-scrollbar-thumb:hover,\s*::-webkit-scrollbar-thumb:active\s*\{[^}]*var\(--scroll-thumb-hover\)/);
});

test('défilement doux et mouvements réduits conservés', () => {
  assert.match(css, /html\s*\{\s*scroll-behavior:\s*smooth;\s*scroll-padding-top:\s*5rem;\s*\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*html\s*\{\s*scroll-behavior:\s*auto;/);
  assert.doesNotMatch(css, /scrollbar-gutter/);
});

test('simulations.html : table-wrap atteignable au clavier avec nom accessible', () => {
  const html = readDoc('simulations.html');
  const tag = /<div class="table-wrap[^"]*"[^>]*>/.exec(html)?.[0] ?? '';
  assert.match(tag, /tabindex="0"/);
  assert.match(tag, /role="region"/);
  const label = /aria-label="([^"]+)"/.exec(tag)?.[1];
  assert.ok(label);
  assert.ok(html.includes(`<caption>${label}</caption>`));
  assert.match(css, /\.table-wrap:focus-visible\s*\{[^}]*var\(--focus\)/);
});

test('barres de défilement : pouce vert foncé de la charte (--deep) translucide au repos', () => {
  assert.equal(rootVar('deep'), '#123d2e');
  assert.equal(rootVar('scroll-thumb'), 'rgba(18, 61, 46, 0.6)');
  assert.equal(rootVar('scroll-thumb-hover'), 'rgba(18, 61, 46, 0.85)');
});

test('barres de défilement : règles ::-webkit-scrollbar réservées au repli @supports not (scrollbar-color)', () => {
  const fallback = /@supports not \(scrollbar-color: auto\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(fallback, /::-webkit-scrollbar\s*\{\s*width:\s*8px;\s*height:\s*8px;\s*\}/);
  assert.match(fallback, /::-webkit-scrollbar-thumb:hover,\s*::-webkit-scrollbar-thumb:active/);
  assert.match(fallback, /::-webkit-scrollbar-button\s*\{\s*display:\s*none/);
});

test('barres de défilement : seules zones défilantes .main-nav (mobile) et .table-wrap, sans double ascenseur CSS', () => {
  const scrollers = [...css.matchAll(/([^{}]+)\{[^{}]*overflow(?:-[xy])?:\s*(?:auto|scroll)\b[^{}]*\}/g)].map(match => match[1].trim()).sort();
  assert.deepEqual(scrollers, ['.main-nav', '.table-wrap']);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.main-nav\s*\{[^}]*overflow-y:\s*auto/);
});

test('barres de défilement : aucune bibliothèque de défilement ni script ajouté', () => {
  assert.doesNotMatch(css, /<script|javascript:/i);
  for (const page of pages) assert.doesNotMatch(readFileSync(page, 'utf8'), /simplebar|overlayscrollbars|perfect-?scrollbar|lenis|locomotive/i, rel(page));
});

for (const page of pages) {
  const html = readFileSync(page, 'utf8');

  test(`${rel(page)} : structure de base`, () => {
    assert.match(html, /<html[^>]*\slang="fr"/i, 'attribut lang="fr" requis');
    assert.match(html, /<title>[^<]+<\/title>/i, 'titre requis');
    assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, 'un seul h1');
  });

  test(`${rel(page)} : liens, images et ressources locales existent`, () => {
    const references = [
      ...attributes(html, 'a', 'href'), ...attributes(html, 'link', 'href'), ...attributes(html, 'img', 'src'),
      ...attributes(html, 'script', 'src')
    ].filter(isLocal);
    for (const value of references) assert.ok(existsSync(target(page, value)), `${value} introuvable`);
  });

  test(`${rel(page)} : ancres internes et textes alternatifs`, () => {
    const ids = new Set(attributes(html, '[a-z0-9]+', 'id'));
    for (const value of attributes(html, 'a', 'href').filter(item => item.startsWith('#') && item.length > 1)) {
      assert.ok(ids.has(value.slice(1)), `ancre ${value} sans id correspondant`);
    }
    for (const image of html.match(/<img\b[^>]*>/gi) ?? []) assert.match(image, /\salt="/i, `image sans alt : ${image.slice(0, 80)}`);
  });

  test(`${rel(page)} : aucune ressource externe chargée (RGPD)`, () => {
    const resourceLinks = (html.match(/<link\b[^>]*\srel="(?:stylesheet|preload|preconnect|icon)[^"]*"[^>]*>/gi) ?? [])
      .map(tag => /\shref="([^"]*)"/i.exec(tag)?.[1]).filter(Boolean);
    const loaded = [...resourceLinks, ...attributes(html, 'img', 'src'), ...attributes(html, 'script', 'src'), ...attributes(html, 'source', 'src')];
    for (const value of loaded.filter(item => /^(https?:)?\/\//i.test(item))) {
      assert.fail(`ressource externe chargée : ${value} (héberger localement)`);
    }
  });
}
