/**
 * Formulaire « Demander une démonstration » (US-926).
 *
 * Logique pure exposée sous `window.OleaLead` et via `module.exports` pour les tests Node ;
 * la partie DOM ne s'exécute que si le formulaire `#lead-form` existe.
 * Aucune donnée n'est stockée côté navigateur (ni cookie ni stockage local).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OleaLead = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_TEXT = 150;
  var MAX_EMAIL = 254;
  var SURFACE_MIN = 0.1;
  var SURFACE_MAX = 100000;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_RE = /^[+0-9 ().-]{6,20}$/;

  function texte(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  function parseSurface(v) {
    var s = texte(typeof v === 'number' ? String(v) : v).replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  /**
   * Valide les valeurs saisies avant tout envoi (bornes identiques au backend).
   * @param {Object} values valeurs brutes du formulaire
   * @returns {{ok: boolean, erreurs: Object<string, string>}} `erreurs` associe un nom de champ à un message
   */
  function validateLead(values) {
    var v = values || {};
    var erreurs = {};
    [['name', 'Indiquez votre nom.'], ['domainName', 'Indiquez le nom de votre domaine.'],
      ['location', 'Indiquez la localisation du domaine.']].forEach(function (c) {
      var t = texte(v[c[0]]);
      if (!t) erreurs[c[0]] = c[1];
      else if (t.length > MAX_TEXT) erreurs[c[0]] = 'Ce champ ne doit pas dépasser ' + MAX_TEXT + ' caractères.';
    });
    var email = texte(v.email);
    if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) erreurs.email = 'Indiquez une adresse e-mail valide.';
    if (!PHONE_RE.test(texte(v.phone))) erreurs.phone = 'Indiquez un numéro de téléphone valide (6 à 20 caractères : chiffres, +, espaces).';
    var surface = parseSurface(v.surfaceHa);
    if (!(surface >= SURFACE_MIN && surface <= SURFACE_MAX)) {
      erreurs.surfaceHa = 'Indiquez une surface entre ' + SURFACE_MIN + ' et ' + SURFACE_MAX + ' hectares.';
    }
    if (v.consent !== true) erreurs.consent = 'Vous devez accepter le traitement de vos données pour envoyer la demande.';
    return { ok: Object.keys(erreurs).length === 0, erreurs: erreurs };
  }

  /**
   * Construit le corps JSON attendu par `POST /api/v1/public/leads` (texte rogné, surface numérique).
   * @param {Object} values valeurs brutes du formulaire
   * @returns {Object} corps prêt à être sérialisé
   */
  function buildPayload(values) {
    var v = values || {};
    return {
      name: texte(v.name),
      email: texte(v.email),
      phone: texte(v.phone),
      domainName: texte(v.domainName),
      surfaceHa: parseSurface(v.surfaceHa),
      location: texte(v.location),
      consent: v.consent === true,
      website: typeof v.website === 'string' ? v.website : ''
    };
  }

  /**
   * URL de l'API de démonstration ; `apiBaseUrl` vide signifie même origine (relais nginx sous `/api/`).
   * @param {{apiBaseUrl?: string}} config configuration `window.OLEASENSE_CONFIG`
   * @returns {string} URL absolue ou relative de `POST /api/v1/public/leads`
   */
  function leadUrl(config) {
    var base = config && typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl.trim().replace(/\/+$/, '') : '';
    return base + '/api/v1/public/leads';
  }

  /**
   * Message affiché au visiteur selon le statut HTTP (0 = échec réseau).
   * @param {number} status statut HTTP de la réponse
   * @returns {string} message en français, sans détail technique
   */
  function messageErreurHttp(status) {
    if (status === 429) return 'Trop de demandes depuis votre connexion. Réessayez dans quelques minutes.';
    if (status === 400) return 'Certaines informations sont invalides. Vérifiez le formulaire et réessayez.';
    return 'L\'envoi a échoué. Réessayez plus tard ou écrivez-nous par e-mail.';
  }

  /**
   * Envoie la demande en POST JSON. Effet de bord : un appel réseau ; aucune relance automatique.
   * Ne rejette jamais : l'échec réseau est converti en `{ ok: false, erreur }`.
   * @param {Object} payload corps issu de `buildPayload`
   * @param {Object} config configuration `window.OLEASENSE_CONFIG`
   * @param {Function} fetchImpl implémentation de `fetch` (injectable pour les tests)
   * @returns {Promise<{ok: boolean, erreur?: string}>}
   */
  function submitLead(payload, config, fetchImpl) {
    return fetchImpl(leadUrl(config), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (rep) {
      // Le corps est lu avant toute redirection : la navigation abandonnerait sinon la réponse en cours.
      var corps = typeof rep.text === 'function' ? rep.text().catch(function () { return ''; }) : Promise.resolve('');
      return corps.then(function () {
        return rep.ok ? { ok: true } : { ok: false, erreur: messageErreurHttp(rep.status) };
      });
    }, function () {
      return { ok: false, erreur: messageErreurHttp(0) };
    });
  }

  function initForm(doc, win) {
    var form = doc.getElementById('lead-form');
    if (!form) return;
    var zone = doc.getElementById('lead-erreur');
    var bouton = form.querySelector('button[type="submit"]');
    var champs = ['name', 'email', 'phone', 'domainName', 'surfaceHa', 'location', 'consent'];

    function lire() {
      var v = {};
      champs.forEach(function (c) {
        var el = form.elements[c];
        v[c] = c === 'consent' ? el.checked : el.value;
      });
      v.website = form.elements.website ? form.elements.website.value : '';
      return v;
    }

    function afficher(erreurs) {
      champs.forEach(function (c) {
        var el = form.elements[c];
        if (erreurs[c]) el.setAttribute('aria-invalid', 'true');
        else el.removeAttribute('aria-invalid');
      });
      var msgs = typeof erreurs === 'string' ? [erreurs] : Object.keys(erreurs).map(function (k) { return erreurs[k]; });
      zone.textContent = '';
      msgs.forEach(function (m) {
        var p = doc.createElement('p');
        p.textContent = m;
        zone.appendChild(p);
      });
      zone.hidden = msgs.length === 0;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var values = lire();
      var r = validateLead(values);
      if (!r.ok) {
        afficher(r.erreurs);
        var premier = form.elements[Object.keys(r.erreurs)[0]];
        if (premier && premier.focus) premier.focus();
        return;
      }
      afficher({});
      bouton.disabled = true;
      submitLead(buildPayload(values), win.OLEASENSE_CONFIG, win.fetch.bind(win)).then(function (res) {
        if (res.ok) {
          win.location.assign('confirmation.html');
          return;
        }
        bouton.disabled = false;
        afficher(res.erreur);
      });
    });
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') initForm(document, window);

  return {
    validateLead: validateLead,
    buildPayload: buildPayload,
    leadUrl: leadUrl,
    messageErreurHttp: messageErreurHttp,
    submitLead: submitLead,
    initForm: initForm
  };
}));
