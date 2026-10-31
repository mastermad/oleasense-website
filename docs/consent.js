/**
 * Gestion du consentement (US-928).
 *
 * Logique pure exposée sous `window.OleaConsent` et via `module.exports` pour les tests Node.
 * Le bandeau n'apparaît que s'il existe au moins une catégorie non essentielle (registre vide
 * aujourd'hui : le site ne dépose aucun cookie ni traceur). Le choix est mémorisé uniquement
 * dans le stockage local du navigateur, pour 180 jours. Aucune requête réseau.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OleaConsent = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONSENT_KEY = 'oleasense_consent';
  var CONSENT_TTL_DAYS = 180;
  var DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Registre des catégories non essentielles (vide : aucun traceur utilisé).
   * Un crochet de démonstration `win.__OLEASENSE_CONSENT_DEMO__` (tableau) permet de tester le bandeau.
   *
   * @param {object} [win] fenêtre.
   * @returns {{id: string, label: string, description: string}[]} catégories valides.
   */
  function getCategories(win) {
    var demo = win && win.__OLEASENSE_CONSENT_DEMO__;
    if (!Array.isArray(demo)) return [];
    return demo.filter(function (c) {
      return c && typeof c.id === 'string' && c.id !== '' && typeof c.label === 'string';
    }).map(function (c) {
      return { id: c.id, label: c.label, description: typeof c.description === 'string' ? c.description : '' };
    });
  }

  /**
   * Lit le choix mémorisé.
   *
   * @param {Storage} storage stockage local.
   * @param {number} now horodatage courant (ms).
   * @returns {{savedAt: number, choices: object} | null} `null` si absent, invalide ou expiré.
   */
  function readConsent(storage, now) {
    var raw;
    try {
      raw = storage && storage.getItem(CONSENT_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!data || typeof data.savedAt !== 'number' || !data.choices || typeof data.choices !== 'object') return null;
    if (now - data.savedAt > CONSENT_TTL_DAYS * DAY_MS || data.savedAt > now) return null;
    return data;
  }

  /**
   * Mémorise le choix (valeurs booléennes strictes uniquement).
   *
   * @param {Storage} storage stockage local.
   * @param {object} choices `{ idCatégorie: boolean }`.
   * @param {number} now horodatage courant (ms).
   * @returns {{savedAt: number, choices: object} | null} l'enregistrement, ou `null` si le stockage est indisponible.
   */
  function saveConsent(storage, choices, now) {
    var clean = {};
    Object.keys(choices || {}).forEach(function (k) { clean[k] = choices[k] === true; });
    var data = { savedAt: now, choices: clean };
    try {
      storage.setItem(CONSENT_KEY, JSON.stringify(data));
    } catch (e) {
      return null;
    }
    return data;
  }

  function setAll(categories, value) {
    var out = {};
    categories.forEach(function (c) { out[c.id] = value; });
    return out;
  }

  /**
   * @param {{id: string}[]} categories catégories concernées.
   * @returns {object} `{ idCatégorie: true }` pour toutes les catégories.
   */
  function acceptAll(categories) { return setAll(categories, true); }

  /**
   * @param {{id: string}[]} categories catégories concernées.
   * @returns {object} `{ idCatégorie: false }` pour toutes les catégories.
   */
  function rejectAll(categories) { return setAll(categories, false); }

  /**
   * Le bandeau est affiché seulement s'il existe une catégorie et aucun choix valide.
   * Sans catégorie non essentielle, rien n'est demandé à l'utilisateur.
   *
   * @param {object[]} categories catégories non essentielles disponibles.
   * @param {object | null} consent choix mémorisé valide, ou `null`.
   * @returns {boolean} `true` si le bandeau doit s'afficher.
   */
  function shouldShowBanner(categories, consent) {
    return categories.length > 0 && !consent;
  }

  /** Expose le choix aux autres scripts (`window.OLEASENSE_CONSENT`). */
  function publish(win, consent) {
    if (win && consent) win.OLEASENSE_CONSENT = consent.choices;
  }

  function el(doc, tag, attrs, text) {
    var node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text) node.textContent = text;
    return node;
  }

  /**
   * Construit le bandeau (textContent uniquement, jamais de HTML injecté).
   *
   * @param {Document} doc document.
   * @param {object[]} categories catégories.
   * @param {function(object): void} onSave rappelé avec les choix.
   * @param {function(): void} onClose rappelé à la fermeture sans choix.
   * @returns {Element} le bandeau.
   */
  function buildBanner(doc, categories, onSave, onClose) {
    var banner = el(doc, 'section', { id: 'consent-banner', class: 'consent-banner', role: 'region', 'aria-label': 'Choix de confidentialité' });
    banner.appendChild(el(doc, 'h2', { class: 'consent-title' }, 'Votre vie privée'));
    banner.appendChild(el(doc, 'p', {}, 'Vous choisissez les usages optionnels. Vous pouvez modifier votre choix à tout moment depuis le pied de page.'));

    var list = el(doc, 'div', { class: 'consent-details', id: 'consent-details', hidden: '' });
    var boxes = [];
    categories.forEach(function (c) {
      var label = el(doc, 'label', { class: 'consent-option' });
      var box = el(doc, 'input', { type: 'checkbox', name: c.id });
      box.checked = false;
      boxes.push({ id: c.id, box: box });
      label.appendChild(box);
      label.appendChild(el(doc, 'span', {}, c.label + (c.description ? ' — ' + c.description : '')));
      list.appendChild(label);
    });
    var save = el(doc, 'button', { type: 'button', class: 'button button-small', id: 'consent-save' }, 'Enregistrer');
    save.addEventListener('click', function () {
      var out = {};
      boxes.forEach(function (b) { out[b.id] = b.box.checked === true; });
      onSave(out);
    });
    list.appendChild(save);

    var actions = el(doc, 'div', { class: 'consent-actions' });
    var reject = el(doc, 'button', { type: 'button', class: 'button button-small', id: 'consent-reject' }, 'Tout refuser');
    var accept = el(doc, 'button', { type: 'button', class: 'button button-small', id: 'consent-accept' }, 'Tout accepter');
    var custom = el(doc, 'button', { type: 'button', class: 'button button-small button-outline', id: 'consent-customize', 'aria-expanded': 'false', 'aria-controls': 'consent-details' }, 'Personnaliser');
    reject.addEventListener('click', function () { onSave(rejectAll(categories)); });
    accept.addEventListener('click', function () { onSave(acceptAll(categories)); });
    custom.addEventListener('click', function () {
      var open = list.hasAttribute('hidden');
      if (open) list.removeAttribute('hidden'); else list.setAttribute('hidden', '');
      custom.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    actions.appendChild(reject);
    actions.appendChild(accept);
    actions.appendChild(custom);
    banner.appendChild(actions);
    banner.appendChild(list);
    banner.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape') onClose();
    });
    return banner;
  }

  /**
   * Initialise le consentement sur la page : bandeau et bouton de pied de page.
   *
   * @param {Window} win fenêtre (document et stockage local inclus).
   * @param {number} [now] horodatage (tests).
   * @returns {{categories: object[], shown: boolean}} état initial.
   */
  function initConsent(win, now) {
    var doc = win.document;
    var storage;
    try { storage = win.localStorage; } catch (e) { storage = null; }
    var ts = typeof now === 'number' ? now : Date.now();
    var categories = getCategories(win);
    var manage = doc.getElementById('consent-manage');
    var current = readConsent(storage, ts);
    publish(win, current);

    function close() {
      var b = doc.getElementById('consent-banner');
      if (b && b.parentNode) b.parentNode.removeChild(b);
      if (manage && typeof manage.focus === 'function') manage.focus();
    }
    function open() {
      if (doc.getElementById('consent-banner')) return;
      var banner = buildBanner(doc, categories, function (choices) {
        var saved = saveConsent(storage, choices, Date.now());
        publish(win, saved || { choices: choices });
        close();
      }, close);
      doc.body.appendChild(banner);
      var first = banner.querySelector ? banner.querySelector('button') : null;
      if (first && typeof first.focus === 'function') first.focus();
    }

    if (manage) {
      if (categories.length > 0) {
        manage.removeAttribute('hidden');
        manage.addEventListener('click', open);
      } else {
        manage.setAttribute('hidden', '');
      }
    }
    var shown = shouldShowBanner(categories, current);
    if (shown) open();
    return { categories: categories, shown: shown };
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initConsent(window);
  }

  return {
    CONSENT_KEY: CONSENT_KEY, CONSENT_TTL_DAYS: CONSENT_TTL_DAYS, getCategories: getCategories,
    readConsent: readConsent, saveConsent: saveConsent, acceptAll: acceptAll, rejectAll: rejectAll,
    shouldShowBanner: shouldShowBanner, buildBanner: buildBanner, initConsent: initConsent
  };
}));
