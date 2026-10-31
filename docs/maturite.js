/**
 * Schéma pédagogique « Timing de récolte » : courbes d'illustration (aucune mesure réelle).
 *
 * Exposé sous `window.OleaMaturite` dans le navigateur, et via `module.exports`
 * pour les tests Node. Les valeurs sont des indices 0-100 purement illustratifs ;
 * le temps est exprimé en jours depuis le début de la fenêtre d'observation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OleaMaturite = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Cible unique du bouton d'action : à remplacer par le formulaire d'étude parcellaire (US-926).
  const CTA_TARGET = '#contact';
  const MAX_DAY = 60;
  const WINDOW_DAYS = 7;
  const OIL_CENTER = 28;
  const PHENOL_CENTER = 34;
  const SPREAD = 7;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Indice d'accumulation d'huile (illustration, 0-100) au jour `t`.
   *
   * @param {number} t Jour, borné à [0, MAX_DAY].
   * @returns {number} Indice croissant.
   */
  function oilCurve(t) {
    return 100 / (1 + Math.exp(-(clamp(t, 0, MAX_DAY) - OIL_CENTER) / SPREAD));
  }

  /**
   * Indice de polyphénols restants (illustration, 0-100) ; sa baisse reflète aussi la montée de l'acidité.
   *
   * @param {number} t Jour, borné à [0, MAX_DAY].
   * @returns {number} Indice décroissant.
   */
  function phenolAcidCurve(t) {
    return 100 / (1 + Math.exp((clamp(t, 0, MAX_DAY) - PHENOL_CENTER) / SPREAD));
  }

  /**
   * Point où les deux courbes se croisent (recherche par dichotomie).
   *
   * @returns {{t: number, value: number}} Jour et indice du croisement.
   */
  function crossingPoint() {
    let lo = 0;
    let hi = MAX_DAY;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (oilCurve(mid) < phenolAcidCurve(mid)) lo = mid; else hi = mid;
    }
    const t = (lo + hi) / 2;
    return { t: t, value: oilCurve(t) };
  }

  /**
   * Fenêtre optimale centrée sur le croisement, bornée à [0, MAX_DAY].
   *
   * @param {number} [daysWindow=WINDOW_DAYS] Largeur souhaitée en jours.
   * @returns {{start: number, end: number}} Bornes en jours.
   */
  function optimalWindow(daysWindow) {
    const width = clamp(typeof daysWindow === 'number' && Number.isFinite(daysWindow) ? daysWindow : WINDOW_DAYS, 0, MAX_DAY);
    const start = clamp(Math.round(crossingPoint().t - width / 2), 0, MAX_DAY - width);
    return { start: start, end: start + width };
  }

  /**
   * État affiché pour une position du curseur.
   *
   * @param {number|string} value Jour (nombre ou chaîne issue d'un input range).
   * @returns {{day: number, phase: string, label: string, text: string, valuetext: string, oil: number, phenol: number}}
   */
  function stateAt(value) {
    const parsed = Number(value);
    const day = clamp(Number.isFinite(parsed) ? Math.round(parsed) : 0, 0, MAX_DAY);
    const win = optimalWindow();
    let phase = 'optimale';
    let label = 'Fenêtre optimale visée';
    let text = 'Les deux courbes se rejoignent : c\'est la fenêtre de 7 jours visée pour concilier rendement en huile et profil Vierge Extra.';
    if (day < win.start) {
      phase = 'precoce';
      label = 'Récolte précoce';
      text = 'Qualité élevée, polyphénols abondants, mais le volume d\'huile accumulé est encore en progression : perte de volume.';
    } else if (day > win.end) {
      phase = 'tardive';
      label = 'Récolte tardive';
      text = 'Volume d\'huile élevé, mais les polyphénols chutent et l\'acidité monte, au risque de dépasser 0,8 %.';
    }
    return {
      day: day,
      phase: phase,
      label: label,
      text: text,
      valuetext: 'Jour ' + day + ' : ' + label,
      oil: Math.round(oilCurve(day)),
      phenol: Math.round(phenolAcidCurve(day))
    };
  }

  function el(doc, name, attrs, content) {
    const node = doc.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (content !== undefined) node.textContent = content;
    return node;
  }

  /**
   * Dessine le schéma dans le SVG et renvoie une fonction de mise à jour du marqueur.
   *
   * Effet de bord : ajoute des éléments SVG (courbes, fenêtre, marqueur) au conteneur `svg`.
   * Appeler une seule fois par conteneur, sinon le schéma est dupliqué.
   *
   * @param {Document} doc Document hôte.
   * @param {SVGElement} svg Conteneur SVG (viewBox 640x320 attendu).
   * @returns {function(number): void} Déplace le marqueur au jour donné.
   */
  function draw(doc, svg) {
    const left = 50;
    const right = 620;
    const top = 20;
    const bottom = 270;
    const x = function (t) { return left + (t / MAX_DAY) * (right - left); };
    const y = function (v) { return bottom - (v / 100) * (bottom - top); };
    const path = function (fn) {
      const pts = [];
      for (let t = 0; t <= MAX_DAY; t += 2) pts.push((t === 0 ? 'M' : 'L') + x(t).toFixed(1) + ' ' + y(fn(t)).toFixed(1));
      return pts.join(' ');
    };
    const win = optimalWindow();
    const cross = crossingPoint();
    svg.appendChild(el(doc, 'rect', { id: 'maturite-fenetre', x: x(win.start), y: top, width: x(win.end) - x(win.start), height: bottom - top, fill: 'rgba(217,170,54,.28)', stroke: '#d9aa36', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
    svg.appendChild(el(doc, 'text', { x: x(win.start) + (x(win.end) - x(win.start)) / 2, y: top + 14, 'text-anchor': 'middle', 'font-weight': 700 }, 'Fenêtre optimale : 7 jours'));
    svg.appendChild(el(doc, 'line', { class: 'axis', x1: left, y1: bottom, x2: right, y2: bottom }));
    svg.appendChild(el(doc, 'line', { class: 'axis', x1: left, y1: top, x2: left, y2: bottom }));
    svg.appendChild(el(doc, 'path', { id: 'maturite-huile', d: path(oilCurve), fill: 'none', stroke: '#d9aa36', 'stroke-width': 3 }));
    svg.appendChild(el(doc, 'path', { id: 'maturite-phenols', d: path(phenolAcidCurve), fill: 'none', stroke: '#8fd1bd', 'stroke-width': 3, 'stroke-dasharray': '7 5' }));
    svg.appendChild(el(doc, 'circle', { id: 'maturite-croisement', cx: x(cross.t), cy: y(cross.value), r: 6, fill: '#fff', stroke: '#0b2a20', 'stroke-width': 2 }));
    svg.appendChild(el(doc, 'text', { x: x(cross.t) + 10, y: y(cross.value) - 10 }, 'Croisement'));
    svg.appendChild(el(doc, 'text', { x: left, y: bottom + 22 }, 'Jours (début)'));
    svg.appendChild(el(doc, 'text', { x: right, y: bottom + 22, 'text-anchor': 'end' }, 'Jours (fin)'));
    svg.appendChild(el(doc, 'text', { x: left + 6, y: top + 14 }, 'Indice'));
    const marker = el(doc, 'line', { id: 'maturite-marqueur', y1: top, y2: bottom, stroke: '#fff', 'stroke-width': 2 });
    svg.appendChild(marker);
    return function (day) {
      const px = x(clamp(day, 0, MAX_DAY));
      marker.setAttribute('x1', px);
      marker.setAttribute('x2', px);
    };
  }

  /**
   * Branche le schéma, le curseur et le bouton d'action sur la page.
   *
   * Effets de bord : fixe le `href` du bouton `#recolte-cta` sur `CTA_TARGET`, puis ajoute un écouteur
   * `input` sur le curseur. Sans éléments requis (svg, curseur, message, badge), seul le bouton est traité.
   *
   * @param {Document} doc Document hôte.
   */
  function init(doc) {
    const svg = doc.getElementById('maturite-svg');
    const range = doc.getElementById('maturite-curseur');
    const message = doc.getElementById('maturite-message');
    const badge = doc.getElementById('maturite-badge');
    const cta = doc.getElementById('recolte-cta');
    if (cta) cta.setAttribute('href', CTA_TARGET);
    if (!svg || !range || !message || !badge) return;
    const move = draw(doc, svg);
    const update = function () {
      const s = stateAt(range.value);
      move(s.day);
      badge.textContent = s.label;
      badge.className = 'badge' + (s.phase === 'optimale' ? '' : ' is-moderate');
      message.textContent = s.text + ' (Jour ' + s.day + ' — indice huile ' + s.oil + ', polyphénols ' + s.phenol + ', illustration.)';
      range.setAttribute('aria-valuetext', s.valuetext);
    };
    range.addEventListener('input', update);
    update();
  }

  if (typeof document !== 'undefined') init(document);

  return {
    CTA_TARGET: CTA_TARGET,
    MAX_DAY: MAX_DAY,
    oilCurve: oilCurve,
    phenolAcidCurve: phenolAcidCurve,
    crossingPoint: crossingPoint,
    optimalWindow: optimalWindow,
    stateAt: stateAt,
    draw: draw,
    init: init
  };
}));
