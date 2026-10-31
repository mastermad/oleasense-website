import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const require = createRequire(import.meta.url);
const conv = require(join(docs, 'conversion.js'));
const read = name => readFileSync(join(docs, name), 'utf8');
const html = read('confirmation.html');
const js = read('conversion.js');

function fakeWin(withStatus = true) {
  const events = [];
  const status = { textContent: '' };
  return {
    events, status,
    dispatchEvent: e => { events.push(e); return true; },
    document: { getElementById: id => (withStatus && id === 'conversion-status' ? status : null) }
  };
}

test('CA2 : hasConsent vrai uniquement pour analytics === true', () => {
  for (const v of [undefined, null, {}, false, 'true', { analytics: false }, { analytics: 'true' }]) {
    assert.equal(conv.hasConsent(v), false);
  }
  assert.equal(conv.hasConsent({ analytics: true }), true);
});

test('CA2 : buildEvent est anonymisé', () => {
  const e = conv.buildEvent();
  assert.deepEqual(Object.keys(e).sort(), ['page', 'type']);
  assert.doesNotMatch(JSON.stringify(e), /@|\d{6}/);
});

test('CA2 : track sans consentement n’émet rien', () => {
  const w = fakeWin();
  assert.equal(conv.track(w, undefined), null);
  assert.equal(conv.track(w, { analytics: false }), null);
  assert.equal(conv.track(null, { analytics: true }), null);
  assert.equal(conv.track({}, { analytics: true }), null);
  assert.equal(w.events.length, 0);
});

test('CA2 : track avec consentement émet un seul événement olea:conversion', () => {
  const w = fakeWin();
  const detail = conv.track(w, { analytics: true });
  assert.deepEqual(detail, { type: 'lead_conversion', page: 'confirmation' });
  assert.equal(w.events.length, 1);
  assert.equal(w.events[0].type, 'olea:conversion');
  assert.deepEqual(w.events[0].detail, detail);
});

test('CA1 : render met à jour #conversion-status selon l’état', () => {
  const w = fakeWin();
  assert.equal(conv.render(w.document, false), true);
  assert.match(w.status.textContent, /désactivée/);
  conv.render(w.document, true);
  assert.match(w.status.textContent, /activée/);
  assert.doesNotMatch(w.status.textContent, /désactivée/);
  assert.equal(conv.render(fakeWin(false).document, true), false);
  assert.equal(conv.render(null, true), false);
});

test('CA1 : init sans consentement ne déclenche rien et affiche le statut', () => {
  const w = fakeWin();
  assert.equal(conv.init(w), null);
  assert.equal(w.events.length, 0);
  assert.match(w.status.textContent, /désactivée/);
});

test('CA2 : init avec consentement déclenche l’événement', () => {
  const w = fakeWin();
  w.OLEASENSE_CONSENT = { analytics: true };
  assert.deepEqual(conv.init(w), conv.buildEvent());
  assert.equal(w.events.length, 1);
  assert.match(w.status.textContent, /activée/);
});

test('CA2 : chargé dans un navigateur, expose OleaConversion et s’initialise seul (intégration)', () => {
  const w = fakeWin();
  w.OLEASENSE_CONSENT = { analytics: true };
  const ctx = { self: w, window: w, document: w.document, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } };
  Object.assign(w, { self: w, window: w, document: w.document, CustomEvent: ctx.CustomEvent });
  vm.runInNewContext(js, ctx);
  assert.equal(typeof w.OleaConversion.init, 'function');
  assert.equal(w.events.length, 1);
  assert.equal(w.events[0].type, 'olea:conversion');
  assert.match(w.status.textContent, /activée/);
});

test('CA3 : confirmation.html affiche l’engagement sous 24 h et charge conversion.js', () => {
  assert.match(html, /sous 24 h/);
  const main = html.match(/<main[\s\S]*?<\/main>/);
  assert.ok(main, 'le contenu principal <main> est présent');
  assert.doesNotMatch(main[0], /aria-hidden/);
  assert.match(html.slice(0, html.indexOf('<main')), /<svg class="icon" aria-hidden="true">/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<script src="conversion\.js" defer><\/script>/);
  assert.match(html, /id="conversion-status" role="status"/);
});

test('CA4 : aucune ressource externe ni stockage navigateur', () => {
  for (const src of [html, js]) {
    assert.doesNotMatch(src, /https?:\/\//);
    assert.doesNotMatch(src, /cookie|localStorage|sessionStorage|fetch|XMLHttpRequest|sendBeacon/i);
  }
});
