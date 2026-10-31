/**
 * Page de confirmation : point d'accroche de conversion anonymisé (US-927).
 *
 * Logique pure exposée sous `window.OleaConversion` et via `module.exports` pour les tests Node.
 * L'événement `olea:conversion` n'est émis que si `window.OLEASENSE_CONSENT.analytics === true`
 * (source fournie par la future gestion du consentement ; absente = non donné).
 * Aucun outil tiers, aucun appel réseau, aucune donnée stockée côté navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OleaConversion = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EVENT_NAME = 'olea:conversion';
  var MSG_ACTIF = 'Mesure d\u2019audience anonymisée activée.';
  var MSG_INACTIF = 'Mesure d\u2019audience désactivée.';

  /**
   * Indique si la mesure d'audience est autorisée.
   *
   * Par défaut le consentement est considéré comme non donné : seule une source
   * explicite `{ analytics: true }` ouvre le suivi (RGPD, opt-in).
   *
   * @param {{analytics?: boolean} | undefined | null} source objet de consentement (`window.OLEASENSE_CONSENT`).
   * @returns {boolean} `true` uniquement si `source.analytics === true` (égalité stricte).
   */
  function hasConsent(source) {
    return !!source && source.analytics === true;
  }

  /**
   * Construit le payload de l'événement de conversion.
   *
   * Volontairement limité à `type` et `page` : aucun nom, e-mail, téléphone ni identifiant
   * de lead ne doit sortir de la page, même si le suivi est autorisé.
   *
   * @returns {{type: string, page: string}} événement anonymisé.
   */
  function buildEvent() {
    return { type: 'lead_conversion', page: 'confirmation' };
  }

  /**
   * Émet l'événement `olea:conversion` sur la fenêtre si le consentement est donné.
   *
   * Sans consentement, rien n'est émis : c'est le point qui garantit l'absence de suivi
   * tant que l'outil de mesure n'est pas validé juridiquement.
   *
   * @param {Window} win fenêtre cible (pour les tests, un objet exposant `dispatchEvent`).
   * @param {object} [source] objet de consentement.
   * @returns {{type: string, page: string} | null} le payload émis, ou `null` si rien n'a été émis.
   */
  function track(win, source) {
    if (!hasConsent(source) || !win || typeof win.dispatchEvent !== 'function') return null;
    var detail = buildEvent();
    win.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: detail }));
    return detail;
  }

  /**
   * Affiche le statut de la mesure d'audience dans `#conversion-status`.
   *
   * Le message est générique (aucune donnée du lead) et écrit via `textContent`, jamais en HTML.
   * L'élément est un `role="status"` : le lecteur d'écran annonce le changement.
   *
   * @param {Document} doc document contenant la page de confirmation.
   * @param {boolean} consent `true` si le suivi a été émis, `false` sinon.
   * @returns {boolean} `false` si l'élément `#conversion-status` est absent, `true` sinon.
   */
  function render(doc, consent) {
    var el = doc && doc.getElementById('conversion-status');
    if (!el) return false;
    el.textContent = consent ? MSG_ACTIF : MSG_INACTIF;
    return true;
  }

  /**
   * Point d'entrée exécuté au chargement de la page de confirmation.
   *
   * Lit `win.OLEASENSE_CONSENT` (non défini en production tant que la gestion du consentement
   * n'est pas livrée), puis émet l'événement si autorisé et met à jour le statut affiché.
   *
   * @param {Window} win fenêtre de la page de confirmation.
   * @returns {{type: string, page: string} | null} le payload émis, ou `null` sans consentement.
   */
  function init(win) {
    var source = win.OLEASENSE_CONSENT;
    var sent = track(win, source);
    render(win.document, sent !== null);
    return sent;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    init(window);
  }

  return { EVENT_NAME: EVENT_NAME, hasConsent: hasConsent, buildEvent: buildEvent, track: track, render: render, init: init };
}));
