/**
 * Logique pure du calculateur ROI des offres OleaSense (sans accès DOM).
 *
 * Exposée sous `window.OleaRoi` dans le navigateur, et via `module.exports`
 * pour les tests Node. Les montants sont des estimations indicatives : le gain
 * par hectare vient de `data/offres.json` (hypothèses d'illustration, non contractuelles).
 *
 * @typedef {Object} OffresData
 * @property {string} mention Mention affichée (« estimation indicative »).
 * @property {{id: string, nom: string, description: string, prixMensuelHT: number, inclus: string[]}[]} offres
 *           Offres proposées ; `id` doit exister dans `hypotheses.gainParHa`.
 * @property {{surfaceMin: number, surfaceMax: number, surfaceDefaut: number, gainParHa: Object<string, number>}} hypotheses
 *           Bornes de surface en hectares et gain annuel estimé par hectare, par id d'offre.
 * @property {{question: string, reponse: string}[]} faq Questions fréquentes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OleaRoi = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function estNombre(valeur) {
    return typeof valeur === 'number' && Number.isFinite(valeur);
  }

  /**
   * Vérifie que le JSON chargé est assez complet pour afficher les offres et le calculateur.
   * Un JSON incomplet doit échouer ici plutôt que produire un calcul faux côté utilisateur.
   *
   * @param {OffresData} data Données brutes issues de `data/offres.json`.
   * @returns {{ok: boolean, erreur?: string}} `ok: false` avec le motif en `erreur` si invalide.
   */
  function validerDonnees(data) {
    if (!data || typeof data !== 'object') return { ok: false, erreur: 'Données absentes.' };
    if (typeof data.mention !== 'string' || !data.mention) return { ok: false, erreur: 'Mention manquante.' };
    if (!Array.isArray(data.offres) || data.offres.length === 0) return { ok: false, erreur: 'Offres manquantes.' };
    const hyp = data.hypotheses;
    if (!hyp || !hyp.gainParHa || !estNombre(hyp.surfaceMin) || !estNombre(hyp.surfaceMax) || !estNombre(hyp.surfaceDefaut)) {
      return { ok: false, erreur: 'Hypothèses incomplètes.' };
    }
    for (const offre of data.offres) {
      if (!offre || !offre.id || !offre.nom || !estNombre(offre.prixMensuelHT) || offre.prixMensuelHT < 0) {
        return { ok: false, erreur: 'Offre invalide.' };
      }
      if (!estNombre(hyp.gainParHa[offre.id]) || hyp.gainParHa[offre.id] < 0) {
        return { ok: false, erreur: 'Gain par hectare manquant pour ' + offre.id + '.' };
      }
    }
    if (!Array.isArray(data.faq)) return { ok: false, erreur: 'FAQ manquante.' };
    return { ok: true };
  }

  /**
   * Interprète la saisie de surface. La virgule décimale française est acceptée.
   *
   * @param {string|number|null|undefined} valeur Saisie brute du champ surface.
   * @param {OffresData['hypotheses']} hyp Bornes `surfaceMin` / `surfaceMax` en hectares.
   * @returns {{ok: boolean, valeur?: number, erreur?: string}} Surface numérique si valide.
   */
  function parseSurface(valeur, hyp) {
    const texte = String(valeur === undefined || valeur === null ? '' : valeur).trim().replace(',', '.');
    if (texte === '') return { ok: false, erreur: 'Saisissez une surface en hectares.' };
    if (!/^-?\d+(\.\d+)?$/.test(texte)) return { ok: false, erreur: 'La surface doit être un nombre.' };
    const surface = Number(texte);
    if (surface < hyp.surfaceMin || surface > hyp.surfaceMax) {
      return { ok: false, erreur: 'La surface doit être comprise entre ' + hyp.surfaceMin + ' et ' + hyp.surfaceMax + ' ha.' };
    }
    return { ok: true, valeur: surface };
  }

  /**
   * Calcule le gain annuel estimé d'une offre pour une surface donnée.
   * Le solde (`net`) compare le gain au coût annuel de l'offre (prix mensuel HT × 12).
   * Ne lève pas d'exception : une entrée inconnue renvoie `ok: false`.
   *
   * @param {OffresData} data Données validées par `validerDonnees`.
   * @param {string} offreId Identifiant de l'offre choisie.
   * @param {number} surfaceHa Surface en hectares, déjà validée par `parseSurface`.
   * @returns {{ok: boolean, gainParHa?: number, gainTotal?: number, coutAnnuel?: number, net?: number, erreur?: string}}
   */
  function calculerGain(data, offreId, surfaceHa) {
    const offre = data.offres.find(function (o) { return o.id === offreId; });
    const gainParHa = data.hypotheses.gainParHa[offreId];
    if (!offre || !estNombre(gainParHa)) return { ok: false, erreur: 'Offre inconnue.' };
    if (!estNombre(surfaceHa) || surfaceHa < 0) return { ok: false, erreur: 'Surface invalide.' };
    const gainTotal = gainParHa * surfaceHa;
    const coutAnnuel = offre.prixMensuelHT * 12;
    return { ok: true, gainParHa: gainParHa, gainTotal: gainTotal, coutAnnuel: coutAnnuel, net: gainTotal - coutAnnuel };
  }

  /**
   * Formate un montant en euros selon la locale française, sans centimes.
   *
   * @param {number} n Montant en euros.
   * @returns {string} Ex. « 1 234 € ».
   */
  function formaterEuros(n) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }

  return { validerDonnees: validerDonnees, parseSurface: parseSurface, calculerGain: calculerGain, formaterEuros: formaterEuros };
}));
