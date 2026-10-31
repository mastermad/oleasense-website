(function () {
  'use strict';
  var section = document.getElementById('offres');
  if (!section || !window.OleaRoi) return;
  var roi = window.OleaRoi;
  var erreur = document.getElementById('offres-erreur');
  var grille = document.getElementById('offres-grille');
  var faq = document.getElementById('faq-liste');
  var form = document.getElementById('roi-form');
  var champSurface = document.getElementById('roi-surface');
  var champOffre = document.getElementById('roi-offre');
  var resultat = document.getElementById('roi-resultat');
  var donnees = null;

  function afficherErreur(message) {
    erreur.textContent = message;
    erreur.hidden = false;
  }

  function el(tag, texte, classe) {
    var n = document.createElement(tag);
    if (texte) n.textContent = texte;
    if (classe) n.className = classe;
    return n;
  }

  function rendreOffres(data) {
    grille.textContent = '';
    data.offres.forEach(function (offre) {
      var carte = el('article', '', 'offre-card');
      carte.appendChild(el('h3', offre.nom));
      carte.appendChild(el('p', roi.formaterEuros(offre.prixMensuelHT) + ' HT / mois (illustration)', 'offre-prix'));
      carte.appendChild(el('p', offre.description));
      var liste = el('ul');
      offre.inclus.forEach(function (i) { liste.appendChild(el('li', i)); });
      carte.appendChild(liste);
      grille.appendChild(carte);
      champOffre.appendChild(Object.assign(el('option', offre.nom), { value: offre.id }));
    });
  }

  function rendreFaq(data) {
    faq.textContent = '';
    data.faq.forEach(function (item) {
      var d = el('details');
      d.appendChild(el('summary', item.question));
      d.appendChild(el('p', item.reponse));
      faq.appendChild(d);
    });
  }

  function calculer(event) {
    if (event) event.preventDefault();
    erreur.hidden = true;
    var surface = roi.parseSurface(champSurface.value, donnees.hypotheses);
    if (!surface.ok) {
      resultat.textContent = '';
      afficherErreur(surface.erreur);
      return;
    }
    var r = roi.calculerGain(donnees, champOffre.value, surface.valeur);
    if (!r.ok) {
      afficherErreur(r.erreur);
      return;
    }
    resultat.textContent = 'Gain estimé : ' + r.gainParHa + ' €/ha, soit ' + roi.formaterEuros(r.gainTotal) +
      ' par an pour ' + surface.valeur + ' ha ; après coût de l\'offre (' + roi.formaterEuros(r.coutAnnuel) + '), solde ' +
      roi.formaterEuros(r.net) + ' (estimation indicative, non contractuelle).';
  }

  fetch('data/offres.json', { headers: { Accept: 'application/json' } })
    .then(function (rep) {
      if (!rep.ok) throw new Error('HTTP ' + rep.status);
      return rep.json();
    })
    .then(function (data) {
      var v = roi.validerDonnees(data);
      if (!v.ok) throw new Error(v.erreur);
      donnees = data;
      rendreOffres(data);
      rendreFaq(data);
      champSurface.value = data.hypotheses.surfaceDefaut;
      champSurface.disabled = false;
      champOffre.disabled = false;
      form.addEventListener('submit', calculer);
    })
    .catch(function () {
      afficherErreur('Les offres et le calculateur sont momentanément indisponibles. Contactez-nous pour obtenir une estimation indicative.');
    });
}());
