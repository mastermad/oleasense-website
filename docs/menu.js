/*
 * Logique pure du méga-menu « Solutions » (testée par node:test).
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

  return { nextState, isOutside, nextIndex };
}));
