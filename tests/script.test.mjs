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

/* Charge menu.js puis script.js dans un contexte vm avec un DOM minimal. */
function load({ hover = false, reduce = false, withMega = true } = {}) {
  const sets = {
    '.nav-toggle': new FakeElement('button', { 'aria-expanded': 'false' }),
    '.has-mega': new FakeElement('li'),
    '.hero-canvas': new FakeElement('canvas'),
    '.cta-canvas': new FakeElement('canvas'),
    '.landscape': new FakeElement('svg')
  };
  const byId = {
    'menu-principal': new FakeElement('nav'),
    entete: new FakeElement('header'),
    'spectre-svg': new FakeElement('svg'),
    'spectre-stress': new FakeElement('input'),
    'spectre-etat': new FakeElement('span'),
    'spectre-message': new FakeElement('p')
  };
  if (withMega) {
    byId['solutions-bouton'] = new FakeElement('button', { 'aria-expanded': 'false' });
    byId['mega-solutions'] = new FakeElement('div');
    byId['mega-solutions'].hidden = true;
  }
  const documentElement = new FakeElement('html');
  const documentListeners = {};
  const windowListeners = {};
  let depth = 0;
  const sandbox = {
    document: {
      documentElement,
      hidden: false,
      querySelector: selector => sets[selector] ?? null,
      querySelectorAll: () => [],
      getElementById: id => byId[id] ?? null,
      createElementNS: (_, name) => new FakeElement(name),
      addEventListener: (type, listener) => { (documentListeners[type] ??= []).push(listener); }
    },
    matchMedia: query => ({ matches: query.includes('reduce') ? reduce : query.includes('hover') ? hover : false }),
    addEventListener: (type, listener) => { (windowListeners[type] ??= []).push(listener); },
    scrollY: 0,
    devicePixelRatio: 1,
    IntersectionObserver: class { observe() {} unobserve() {} },
    ResizeObserver: class { observe() {} unobserve() {} },
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
  return { sandbox, sets, byId, documentElement, documentListeners, windowListeners };
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

test('survol bureau : mouseenter ouvre, le clic suivant ne referme pas, mouseleave ferme', () => {
  const dom = load({ hover: true });
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  mega.dispatch('mouseenter');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  button.dispatch('click');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('mouseleave');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('survol bureau : mouseenter sur un panneau déjà ouvert ne change rien', () => {
  const dom = load({ hover: true });
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  openMega(dom);
  mega.dispatch('mouseenter');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('mouseleave');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('sans survol bureau (tactile) : mouseenter n’ouvre pas et mouseleave ne ferme pas', () => {
  const dom = load({ hover: false });
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  mega.dispatch('mouseenter');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  openMega(dom);
  mega.dispatch('mouseleave');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

test('focusout : ferme seulement si le focus sort du méga-menu', () => {
  const dom = load();
  const mega = dom.sets['.has-mega'];
  const button = dom.byId['solutions-bouton'];
  const inside = new FakeElement('a');
  mega.appendChild(inside);
  const outside = new FakeElement('a');
  openMega(dom);
  mega.dispatch('focusout', { relatedTarget: null });
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  mega.dispatch('focusout', { relatedTarget: inside });
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
