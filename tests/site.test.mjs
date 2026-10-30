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
