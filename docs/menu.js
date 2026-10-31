/*
 * Logique pure des sous-menus Solutions, Produits et Simulations (testée par node:test).
 * Exposé sous `window.OleaMenu` dans le navigateur, et via `module.exports`
 * sous Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OleaMenu = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * État ouvert/fermé du méga-menu après un évènement.
   *
   * @param {boolean} open état courant (vrai = ouvert)
   * @param {'toggle'|'open'|'close'|'escape'|'outside'|'focusout'} event évènement utilisateur
   * @returns {boolean} nouvel état ; un évènement inconnu conserve l'état courant
   */
  function nextState(open, event) {
    switch (event) {
      case 'toggle': return !open;
      case 'open': return true;
      case 'close':
      case 'escape':
      case 'outside':
      case 'focusout': return false;
      default: return Boolean(open);
    }
  }

  /**
   * Indique si un évènement doit fermer le méga-menu (clic ou focus hors zone).
   *
   * @param {Node|null} target nœud ciblé par l'évènement
   * @param {Node|null} container zone du méga-menu
   * @returns {boolean} vrai si la cible est absente, si le conteneur est absent ou si la cible est hors du conteneur
   */
  function isOutside(target, container) {
    if (!target || !container) return true;
    return !container.contains(target);
  }

  /**
   * Index de l'élément à focaliser dans la liste des liens du méga-menu.
   *
   * @param {number} index index courant (-1 si aucun élément n'a le focus)
   * @param {number} count nombre d'éléments de la liste
   * @param {string} key touche clavier (ArrowDown/ArrowRight, ArrowUp/ArrowLeft, Home, End)
   * @returns {number} index cible ; -1 si la liste est vide, index courant pour une touche inconnue
   */
  function nextIndex(index, count, key) {
    if (!count || count < 1) return -1;
    switch (key) {
      case 'ArrowDown':
      case 'ArrowRight': return (index + 1) % count;
      case 'ArrowUp':
      case 'ArrowLeft': return index <= 0 ? count - 1 : index - 1;
      case 'Home': return 0;
      case 'End': return count - 1;
      default: return index;
    }
  }

  /** Délai (ms) avant la fermeture d'un sous-menu ouvert au survol. */
  const CLOSE_DELAY = 250;

  /**
   * Indique si la perte de focus doit fermer le sous-menu : jamais quand le
   * nouveau focus est inconnu (relatedTarget nul, clic sur une zone non focusable)
   * ou reste dans le menu.
   *
   * @param {Node|null} related nœud qui reçoit le focus (relatedTarget)
   * @param {Node|null} container zone du menu principal (passage entre sous-menus permis)
   * @returns {boolean} vrai seulement si le focus part vers un nœud extérieur
   */
  function shouldCloseOnFocusout(related, container) {
    return Boolean(related) && isOutside(related, container);
  }

  /**
   * Nouvel état d'un sous-menu après un clic sur son déclencheur : un menu
   * ouvert au survol devient persistant, sinon le clic bascule l'ouverture.
   *
   * @param {{open: boolean, byHover: boolean}} state état courant
   * @returns {{open: boolean, byHover: boolean}} nouvel état (jamais ouvert « au survol » après un clic)
   */
  function afterClick(state) {
    const current = state || {};
    if (current.open && current.byHover) return { open: true, byHover: false };
    return { open: !current.open, byHover: false };
  }

  /**
   * Indique si la sortie du pointeur doit programmer une fermeture : seulement
   * pour un menu ouvert au survol, jamais pour un menu ouvert au clic.
   *
   * @param {{open: boolean, byHover: boolean}} state état courant
   * @returns {boolean} vrai si une fermeture temporisée est attendue
   */
  function shouldAutoClose(state) {
    return Boolean(state && state.open && state.byHover);
  }

  /**
   * États d'ouverture d'un ensemble de sous-menus dont un seul est ouvert.
   *
   * @param {number} count nombre de sous-menus
   * @param {number} openIndex index du sous-menu à ouvrir (hors bornes : tous fermés)
   * @returns {boolean[]} un booléen par sous-menu
   */
  function openOnly(count, openIndex) {
    return Array.from({ length: Math.max(0, count || 0) }, (_, index) => index === openIndex);
  }

  /**
   * Fermeture temporisée annulable.
   *
   * @param {Function} close action de fermeture
   * @param {number} [delay] délai en ms (250 par défaut)
   * @param {{set?: Function, clear?: Function}} [timers] minuteries injectables (tests)
   * @returns {{schedule: Function, cancel: Function, isPending: Function}} contrôle de la minuterie
   */
  function createCloser(close, delay, timers) {
    const given = timers || {};
    const set = given.set || ((callback, ms) => setTimeout(callback, ms));
    const clear = given.clear || (id => clearTimeout(id));
    let pending = null;
    const cancel = () => {
      if (pending === null) return;
      clear(pending);
      pending = null;
    };
    const schedule = () => {
      cancel();
      pending = set(() => { pending = null; close(); }, delay === undefined ? CLOSE_DELAY : delay);
    };
    return { schedule, cancel, isPending: () => pending !== null };
  }

  return { CLOSE_DELAY, nextState, isOutside, nextIndex, shouldCloseOnFocusout, afterClick, shouldAutoClose, openOnly, createCloser };
}));
