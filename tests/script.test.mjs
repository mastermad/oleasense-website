import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const read = name => readFileSync(join(docs, name), 'utf8');

/* Objet appelable et chaînable pour les API canvas/SVG non vérifiées ici. */
const callable = new Proxy(function () {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : callable),
  apply: () => callable,
  set: () => true
});

const fire = (listeners = [], event = {}) => {
  for (const listener of listeners) listener({ target: null, relatedTarget: null, preventDefault() {}, ...event });
};

class FakeElement {
  constructor(tag, attributes = {}) {
    this.tag = tag;
    this.attributes = { ...attributes };
    this.listeners = {};
    this.classes = new Set();
    this.children = [];
    this.focused = false;
    this.hidden = false;
    this.value = '50';
    this.textContent = '';
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, force) => {
        const on = force === undefined ? !this.classes.has(name) : Boolean(force);
        if (on) this.classes.add(name); else this.classes.delete(name);
        return on;
      },
      contains: name => this.classes.has(name)
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelector(selector) { return this.sub?.[selector] ?? null; }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  dispatch(type, event = {}) { fire(this.listeners[type], event); }
  appendChild(child) { this.children.push(child); return child; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest(selector) { return selector === 'a' && this.tag === 'a' ? this : null; }
  focus() { this.focused = true; }
  observe() {}
  unobserve() {}
  getContext() { return callable; }
}

const MEGA_NAMES = ['solutions', 'produits', 'simulations'];

/* Charge menu.js puis script.js dans un contexte vm avec un DOM minimal. */
function load({ hover = false, reduce = false, withMega = true, media = false, failingPlay = false } = {}) {
  const revealItems = media ? [new FakeElement('div'), new FakeElement('div')] : [];
  const video = media ? Object.assign(new FakeElement('video'), {
    loaded: false,
    load() { this.loaded = true; },
    play: () => (failingPlay ? Promise.reject(new Error('lecture bloquée')) : Promise.resolve())
  }) : null;
  const gaugeElement = media ? new FakeElement('div') : null;
  const observers = [];
  const resizeCallbacks = [];
  const sets = {
    '.nav-toggle': new FakeElement('button', { 'aria-expanded': 'false' }),
    '.hero-canvas': new FakeElement('canvas'),
    '.cta-canvas': new FakeElement('canvas'),
    '.landscape': new FakeElement('svg'),
    '.hero-video': video,
    '.gauge': gaugeElement
  };
  const byId = {
    'menu-principal': new FakeElement('nav'),
    entete: new FakeElement('header'),
    'spectre-svg': new FakeElement('svg'),
    'spectre-stress': new FakeElement('input'),
    'spectre-etat': new FakeElement('span'),
    'spectre-message': new FakeElement('p')
  };
  const items = [];
  if (withMega) {
    for (const name of MEGA_NAMES) {
      const item = new FakeElement('li');
      const button = new FakeElement('button', { 'aria-expanded': 'false' });
      const panel = new FakeElement('div');
      panel.hidden = true;
      item.sub = { '.mega-toggle': button, '.mega-panel': panel };
      byId[`${name}-bouton`] = button;
      byId[`mega-${name}`] = panel;
      items.push(item);
    }
    sets['.has-mega'] = items[0];
    items.push(Object.assign(new FakeElement('li'), { sub: {} }));
  }
  const timers = [];
  const documentElement = new FakeElement('html');
  const documentListeners = {};
  const windowListeners = {};
  let depth = 0;
  const sandbox = {
    document: {
      documentElement,
      hidden: false,
      querySelector: selector => sets[selector] ?? null,
      querySelectorAll: selector => (selector === '.has-mega' ? items : selector === '.reveal' ? revealItems : []),
      getElementById: id => byId[id] ?? null,
      createElementNS: (_, name) => new FakeElement(name),
      addEventListener: (type, listener) => { (documentListeners[type] ??= []).push(listener); }
    },
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout: id => { timers[id - 1] = null; },
    matchMedia: query => ({ matches: query.includes('reduce') ? reduce : query.includes('hover') ? hover : false }),
    addEventListener: (type, listener) => { (windowListeners[type] ??= []).push(listener); },
    scrollY: 0,
    devicePixelRatio: 1,
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; this.observed = []; this.unobserved = []; observers.push(this); }
      observe(element) { this.observed.push(element); }
      unobserve(element) { this.unobserved.push(element); }
    },
    ResizeObserver: class {
      constructor(callback) { resizeCallbacks.push(callback); }
      observe() {}
      unobserve() {}
    },
    requestAnimationFrame: callback => {
      if (depth < 2) { depth += 1; callback(100); depth -= 1; }
      return depth;
    },
    cancelAnimationFrame() {}
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const context = createContext(sandbox);
  runInContext(read('menu.js'), context, { filename: 'menu.js' });
  runInContext(read('script.js'), context, { filename: 'script.js' });
  const runTimers = () => { for (const callback of timers.splice(0)) if (callback) callback(); };
  return { sandbox, sets, byId, items, timers, runTimers, documentElement, documentListeners, windowListeners, revealItems, video, gaugeElement, observers, resizeCallbacks };
}

const openMega = dom => dom.byId['solutions-bouton'].dispatch('click');

test('bouton Solutions : le clic ouvre puis referme le panneau', () => {
  const dom = load();
  const button = dom.byId['solutions-bouton'];
  const panel = dom.byId['mega-solutions'];
  const mega = dom.sets['.has-mega'];
  button.dispatch('click');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  assert.ok(mega.classes.has('is-open'));
  button.dispatch('click');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  assert.equal(mega.classes.has('is-open'), false);
});

test('survol bureau : mouseenter ouvre, le clic suivant rend le menu persistant, mouseleave ne ferme plus', () => {
  const dom = load({ hover: true });
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  mega.dispatch('mouseenter');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  button.dispatch('click');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('mouseleave');
  assert.equal(dom.timers.length, 0);
  dom.runTimers();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

test('survol bureau : mouseleave ferme après le délai, un retour du pointeur annule la fermeture', () => {
  const dom = load({ hover: true });
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  mega.dispatch('mouseenter');
  mega.dispatch('mouseleave');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('mouseenter');
  dom.runTimers();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('mouseleave');
  dom.runTimers();
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.byId['mega-solutions'].hidden, true);
});

test('un seul sous-menu ouvert à la fois', () => {
  const dom = load({ hover: true });
  dom.items[0].dispatch('mouseenter');
  dom.items[1].dispatch('mouseenter');
  assert.equal(dom.byId['solutions-bouton'].getAttribute('aria-expanded'), 'false');
  assert.equal(dom.byId['produits-bouton'].getAttribute('aria-expanded'), 'true');
  dom.byId['simulations-bouton'].dispatch('click');
  assert.equal(dom.byId['produits-bouton'].getAttribute('aria-expanded'), 'false');
  assert.equal(dom.byId['simulations-bouton'].getAttribute('aria-expanded'), 'true');
  assert.equal(dom.byId['mega-simulations'].hidden, false);
});

test('survol bureau : mouseenter sur un panneau déjà ouvert au clic ne change rien', () => {
  const dom = load({ hover: true });
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  openMega(dom);
  mega.dispatch('mouseenter');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('mouseleave');
  dom.runTimers();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

test('sans survol bureau (tactile) : mouseenter n’ouvre pas et mouseleave ne ferme pas', () => {
  const dom = load({ hover: false });
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  mega.dispatch('mouseenter');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  openMega(dom);
  mega.dispatch('mouseleave');
  dom.runTimers();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

test('focusout : ferme seulement si le focus sort du menu principal', () => {
  const dom = load();
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  const nav = dom.byId['menu-principal'];
  const inside = new FakeElement('a');
  nav.appendChild(inside);
  const otherMegaButton = new FakeElement('button');
  nav.appendChild(otherMegaButton);
  const outside = new FakeElement('a');
  openMega(dom);
  mega.dispatch('focusout', { relatedTarget: null });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('focusout', { relatedTarget: inside });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('focusout', { relatedTarget: otherMegaButton });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('focusout', { relatedTarget: outside });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('clic extérieur ferme le méga-menu ; un clic interne le laisse ouvert', () => {
  const dom = load();
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  const inside = new FakeElement('a');
  mega.appendChild(inside);
  openMega(dom);
  fire(dom.documentListeners.click, { target: inside });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  fire(dom.documentListeners.click, { target: new FakeElement('main') });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  fire(dom.documentListeners.click, { target: new FakeElement('main') });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('clic sur un lien du panneau le referme ; clic sur le reste du panneau non', () => {
  const dom = load();
  const button = dom.byId['solutions-bouton'];
  const panel = dom.byId['mega-solutions'];
  openMega(dom);
  panel.dispatch('click', { target: new FakeElement('span') });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  panel.dispatch('click', { target: new FakeElement('a') });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('Échap ferme le méga-menu, rend le focus au bouton et ignore les autres touches', () => {
  const dom = load();
  const button = dom.byId['solutions-bouton'];
  openMega(dom);
  fire(dom.documentListeners.keydown, { key: 'Enter' });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.focused, false);
  fire(dom.documentListeners.keydown, { key: 'Escape' });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.focused, true);
});

test('Échap ferme le menu burger et rend le focus au burger, sans effet si rien n’est ouvert', () => {
  const dom = load();
  const toggle = dom.sets['.nav-toggle'];
  const menu = dom.byId['menu-principal'];
  toggle.dispatch('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(menu.classes.has('is-open'));
  fire(dom.documentListeners.keydown, { key: 'Escape' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.focused, true);
  toggle.focused = false;
  fire(dom.documentListeners.keydown, { key: 'Escape' });
  assert.equal(toggle.focused, false);
});

test('burger : le clic bascule le menu et un lien du menu le ferme', () => {
  const dom = load();
  const toggle = dom.sets['.nav-toggle'];
  const menu = dom.byId['menu-principal'];
  toggle.dispatch('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  menu.dispatch('click', { target: new FakeElement('span') });
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  menu.dispatch('click', { target: new FakeElement('a') });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.classes.has('is-open'), false);
});

test('sans méga-menu dans le DOM, le script reste fonctionnel pour le burger', () => {
  const dom = load({ withMega: false });
  const toggle = dom.sets['.nav-toggle'];
  toggle.dispatch('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  fire(dom.documentListeners.keydown, { key: 'Escape' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('le script active la classe js et met à jour l’en-tête au défilement', () => {
  const dom = load();
  const header = dom.byId.entete;
  assert.ok(dom.documentElement.classes.has('js'));
  assert.equal(header.classes.has('is-scrolled'), false);
  dom.sandbox.scrollY = 20;
  fire(dom.windowListeners.scroll);
  assert.equal(header.classes.has('is-scrolled'), true);
  dom.sandbox.scrollY = 0;
  fire(dom.windowListeners.scroll);
  assert.equal(header.classes.has('is-scrolled'), false);
});

test('le curseur spectral met à jour l’état, le badge et le message', () => {
  const dom = load();
  const slider = dom.byId['spectre-stress'];
  const badge = dom.byId['spectre-etat'];
  const message = dom.byId['spectre-message'];
  assert.equal(badge.textContent, 'Stress modéré');
  slider.value = '10';
  slider.dispatch('input');
  assert.equal(badge.textContent, 'Végétation saine');
  assert.equal(badge.className, 'badge');
  assert.equal(slider.getAttribute('aria-valuetext'), 'Végétation saine');
  assert.match(message.textContent, /^Forte absorption/);
  slider.value = '90';
  slider.dispatch('input');
  assert.equal(badge.textContent, 'Stress sévère');
  assert.equal(badge.className, 'badge is-severe');
  assert.match(message.textContent, /^La signature s'aplatit/);
  slider.value = '50';
  slider.dispatch('input');
  assert.equal(badge.className, 'badge is-moderate');
});

test('les ondes et le paysage d’oliveraie sont dessinés au chargement', () => {
  const dom = load();
  assert.ok(dom.byId['spectre-svg'].children.length > 0);
  assert.ok(dom.sets['.landscape'].children.length > 0);
});

test('mouvement réduit : le rendu statique s’exécute sans animation', () => {
  const dom = load({ reduce: true });
  assert.ok(dom.byId['spectre-svg'].children.length > 0);
  openMega(dom);
  assert.equal(dom.byId['solutions-bouton'].getAttribute('aria-expanded'), 'true');
});

test('reveal : éléments observés, révélés à l’intersection puis désabonnés', () => {
  const dom = load({ media: true });
  const [first, second] = dom.revealItems;
  const observer = dom.observers.find(item => item.observed.includes(first));
  assert.ok(observer.observed.includes(second));
  observer.callback([{ isIntersecting: false, target: first }]);
  assert.equal(first.classList.contains('is-visible'), false);
  observer.callback([{ isIntersecting: true, target: first }]);
  assert.equal(first.classList.contains('is-visible'), true);
  assert.deepEqual(observer.unobserved, [first]);
  assert.equal(second.classList.contains('is-visible'), false);
});

test('mouvement réduit : contenus affichés sans observateur, vidéo non chargée', () => {
  const dom = load({ media: true, reduce: true });
  assert.ok(dom.revealItems.every(item => item.classList.contains('is-visible')));
  assert.equal(dom.observers.some(item => item.observed.includes(dom.revealItems[0])), false);
  assert.equal(dom.video.loaded, false);
  dom.video.dispatch('canplay');
  assert.equal(dom.video.classList.contains('is-ready'), false);
});

test('vidéo d’ambiance : chargée puis affichée au canplay', () => {
  const dom = load({ media: true });
  assert.equal(dom.video.loaded, true);
  assert.equal(dom.video.preload, 'auto');
  dom.video.dispatch('canplay');
  assert.equal(dom.video.classList.contains('is-ready'), true);
});

test('vidéo d’ambiance : un échec de lecture automatique ne bloque pas l’affichage', async () => {
  const dom = load({ media: true, failingPlay: true });
  dom.video.dispatch('canplay');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.video.classList.contains('is-ready'), true);
});

test('jauge du héro : activée après son délai d’affichage', () => {
  const dom = load({ media: true });
  assert.equal(dom.gaugeElement.classList.contains('is-on'), false);
  dom.runTimers();
  assert.equal(dom.gaugeElement.classList.contains('is-on'), true);
});

test('fonds animés : redimensionnement et visibilité suivis par les observateurs', () => {
  const dom = load({ media: true, reduce: true });
  assert.doesNotThrow(() => dom.resizeCallbacks.forEach(callback => callback([])));
  const canvas = dom.sets['.hero-canvas'];
  const observer = dom.observers.find(item => item.observed.includes(canvas));
  assert.ok(observer);
  assert.doesNotThrow(() => observer.callback([{ isIntersecting: false }]));
  assert.doesNotThrow(() => observer.callback([{ isIntersecting: true }]));
});

