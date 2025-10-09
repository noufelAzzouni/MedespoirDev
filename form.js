/**
 * Formstack - Robust Datepicker & Form handlers
 * Coller ce fichier à la place du JS existant.
 * - Initialise/joue bien avec jQuery/jQuery UI (sans casser la page si possible)
 * - Ré-initialise les datepickers quand Formstack ajoute/recrée des éléments
 * - Délégation des events pour survivre aux remplacements de DOM
 * - Correction : input[type="textbox"] -> input[type="text"]
 */

(function () {
  'use strict';

  // Configuration : ajuste si nécessaire
  var JQUERY_SRC = 'https://code.jquery.com/jquery-3.5.1.min.js';
  var JQUERY_UI_SRC = 'https://code.jquery.com/ui/1.13.2/jquery-ui.min.js';
  var JQUERY_UI_CSS = 'https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.css';

  // Sélecteur du container du formulaire Formstack (modifie si tu as le conteneur exact).
  var FORM_CONTAINER_SELECTOR = '.fs-form-container'; // fallback plus bas si introuvable

  // --- Formats utilisés ---
  window.fs_formLocalejQueryDate = 'dd/mm/yy';
  window.fs_formLocalejQueryTime = 'hh:mm:ss TT';
  window.fs_formLocaleDate = 'DD/MM/YYYY';
  window.fs_formLocaleTime = 'hh:mm:ss A';

  // --- Helpers ---
  function log() { if (window.console && console.log) console.log.apply(console, arguments); }
  function warn() { if (window.console && console.warn) console.warn.apply(console, arguments); }

  function insertCssIfMissing(href) {
    if (!document.querySelector('link[rel="stylesheet"][href="' + href + '"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      (document.head || document.body).appendChild(l);
      log('Injected CSS:', href);
    }
  }

  function loadScriptOnce(src, cb) {
    if (document.querySelector('script[src="' + src + '"]')) {
      // already in progress or present
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing && typeof cb === 'function') {
        // try to call cb after small delay to allow load
        setTimeout(cb, 50);
      }
      return;
    }
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = function () { log('Loaded script:', src); if (cb) cb(); };
    s.onerror = function () { warn('Failed loading script:', src); if (cb) cb(); };
    document.head.appendChild(s);
  }

  // Recherche robuste des inputs date
  function getDateInputs() {
    return (window.jQuery ? jQuery : document).querySelectorAll ?
      // fallback to querySelectorAll for environments without jQuery
      document.querySelectorAll("input[id$='Date__c'], input[name$='Date__c'], input[id*='Date__c']") :
      jQuery("input[id$='Date__c'], input[name$='Date__c'], input[id*='Date__c']").filter(':visible');
  }

  // Utilisation jQuery si présente ; sinon on utilisera alternatives minimalistes
  function safe$(selector, ctx) {
    if (window.jQuery) return jQuery(selector, ctx);
    ctx = ctx || document;
    var nodes = ctx.querySelectorAll(selector);
    // wrapper minimal pour avoir .each .length .val .on .off .hasClass .addClass .removeClass
    var wrapper = Array.prototype.slice.call(nodes);
    wrapper.length = nodes.length;
    wrapper.each = function (fn) { wrapper.forEach(function (el, i) { fn.call(el, i, el); }); return wrapper; };
    wrapper.val = function (v) {
      if (v === undefined) return wrapper[0] ? wrapper[0].value : undefined;
      wrapper.forEach(function (el) { el.value = v; });
      return wrapper;
    };
    wrapper.on = function () { /* noop */ return wrapper; };
    wrapper.off = function () { /* noop */ return wrapper; };
    wrapper.filter = function () { return wrapper; };
    wrapper.hasClass = function () { return false; };
    wrapper.addClass = function () { return wrapper; };
    wrapper.removeClass = function () { return wrapper; };
    wrapper.length = nodes.length;
    return wrapper;
  }

  // Normalise une année 2 chiffres -> 4 chiffres (assume 20xx)
  function normalizeYear(y) {
    if (typeof y === 'number') return y;
    if (y.length === 2) return 2000 + parseInt(y, 10);
    return parseInt(y, 10);
  }

  // Validation de date (acceptant JJ/MM/AA ou JJ/MM/AAAA)
  function validateEventDate(dateField) {
    var $ = window.jQuery ? jQuery : null;
    var eventDate = ($ ? $(dateField).val() : (dateField.value || '')).trim();

    if ($) $(dateField).removeClass('ff-input-type-invalid');

    if (!eventDate) {
      alert("Veuillez sélectionner une date.");
      if ($) $(dateField).val(''); else dateField.value = '';
      return false;
    }

    var datePattern = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/;
    if (!datePattern.test(eventDate)) {
      alert("Le format de la date est invalide. Veuillez entrer la date au format JJ/MM/AAAA.");
      if ($) $(dateField).val(''); else dateField.value = '';
      return false;
    }

    var parts = eventDate.split('/');
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var year = normalizeYear(parts[2]);

    var selectedDate = new Date(year, month, day);
    if (isNaN(selectedDate.getTime())) {
      alert("La date sélectionnée est invalide.");
      if ($) $(dateField).val(''); else dateField.value = '';
      return false;
    }

    var today = new Date(); today.setHours(0,0,0,0);
    var five = new Date(today); five.setDate(today.getDate() + 5);

    if (selectedDate < today || selectedDate > five) {
      alert("La date de la garde doit être comprise entre aujourd'hui et les 5 prochains jours.");
      if ($) $(dateField).val(''); else dateField.value = '';
      return false;
    }

    log("Date valide :", selectedDate.toDateString());
    return true;
  }

  // Calcul/validation durée
  function validateEventDuration() {
    if (!window.jQuery) return; // utilise jQuery pour ces champs
    var heureDebut = jQuery("#crgchr_Inscription__c\\.HeureDebTxt__c").val().trim();
    var heureFin = jQuery("#crgchr_Inscription__c\\.HeureFinTxt__c").val().trim();

    if (!heureDebut || !heureFin) return;

    var hDeb = heureDebut.split(':'), hFin = heureFin.split(':');
    if (hDeb.length !== 2 || hFin.length !== 2) { alert("Le format des heures est invalide. Utilisez le format HH:mm."); return; }

    var debut = new Date(); debut.setHours(parseInt(hDeb[0],10), parseInt(hDeb[1],10), 0, 0);
    var fin = new Date(); fin.setHours(parseInt(hFin[0],10), parseInt(hFin[1],10), 0, 0);

    var duree = (fin - debut) / 1000 / 60 / 60;
    if (duree < 3) {
      alert("Veuillez choisir une durée de garde supérieure à 3h !");
      jQuery("#crgchr_Inscription__c\\.HeureFinTxt__c").val('');
    } else if (duree > 10) {
      alert("Veuillez choisir une durée de garde inférieure à 10h !");
      jQuery("#crgchr_Inscription__c\\.HeureFinTxt__c").val('');
    }
  }

  // Init datepicker de façon sûre sur un element jQuery
  function safeInitDatepickerFor($input) {
    if (!window.jQuery || !$input || !$input.length) return;
    try {
      // détruire si déjà présent
      if ($input.hasClass('hasDatepicker') || $input.datepicker('instance')) {
        try { $input.datepicker('destroy'); } catch (e) { /* ignore */ }
      }

      $input.datepicker({
        dateFormat: window.fs_formLocalejQueryDate || 'dd/mm/yy',
        firstDay: 1,
        minDate: 0,
        maxDate: 5,
        beforeShowDay: function(date) {
          var today = new Date(); today.setHours(0,0,0,0);
          var five = new Date(today); five.setDate(today.getDate() + 5);
          var ok = date >= today && date <= five;
          return [ok, ok ? '' : 'ui-state-disabled', ok ? '' : 'Date non disponible'];
        }
      });
      log('Initialized datepicker on', $input.get(0));
    } catch (err) {
      warn('safeInitDatepickerFor error:', err);
    }
  }

  // (Re)initialise tous les datepickers visibles
  function initAllDatepickers() {
    if (!window.jQuery) { log('jQuery absent, skip datepicker init'); return; }
    var $dates = jQuery("input[id$='Date__c'], input[name$='Date__c'], input[id*='Date__c']").filter(':visible');
    log('Found date inputs for init:', $dates.length);
    $dates.each(function () { safeInitDatepickerFor(jQuery(this)); });
  }

  // Fix ClearNewRepeatableSection -> input[type="text"]
  function ClearNewRepeatableSection(elem) {
    var ignoreHiddenPicklists = 'select[data-ishidden="false"]';
    log("Clear Repeatable Section");

    jQuery(elem).parents('.ff-sec-repeat-wrapper').next().find('input[type="text"]').val('');
    jQuery(elem).parents('.ff-sec-repeat-wrapper').next().find('textarea').val('');
    jQuery(elem).parents('.ff-sec-repeat-wrapper').next().find('span.ff-ext-selected').removeClass('ff-ext-selected');

    var picklists = jQuery(elem).parents('.ff-sec-repeat-wrapper').next().find(ignoreHiddenPicklists);
    picklists.each(function() {
      jQuery(this).val('');
      try { if (window.fs && fs.EH && fs.EH.initFlexControl) fs.EH.initFlexControl(jQuery(this)); } catch(e){/*ignore*/}
    });
    BindClickHandlers();
    return true;
  }

  function BindClickHandlers() {
    jQuery('.ff-sec-repeat-wrapper a.ff-add').off('click.rbind').on('click.rbind', function () {
      ClearNewRepeatableSection(this);
      // Ré-init datepickers juste après l'ajout de la section
      setTimeout(function () { initAllDatepickers(); }, 200);
    });
    jQuery('.ff-sec-repeat-wrapper a.ff-remove').off('click.rbind').on('click.rbind', function () {
      // supposé RemoveFromRepeatableSection existe ailleurs
      try { RemoveFromRepeatableSection(this); } catch(e){ log('RemoveFromRepeatableSection not found'); }
      BindClickHandlers();
    });
  }

  function translateLabels() {
    if (!window.jQuery) return;
    jQuery("select[class*='ff-select-type']").find("option").each(function () {
      if (jQuery(this).val() === "") {
        jQuery(this).text("Sélectionner une option");
      }
    });
  }

  // --- MutationObserver : surveille le conteneur du formulaire pour ré-init si DOM change ---
  function startMutationObserver(containerSelector) {
    try {
      var container = document.querySelector(containerSelector);
      if (!container) {
        container = document.body; // fallback : observer entire body (coûteux mais sûr)
      }
      if (!window.MutationObserver) {
        log('No MutationObserver support');
        return;
      }
      var mo = new MutationObserver(function (mutations) {
        var shouldInit = false;
        mutations.forEach(function (m) {
          if (m.addedNodes && m.addedNodes.length) {
            for (var i = 0; i < m.addedNodes.length; i++) {
              var node = m.addedNodes[i];
              // si un input Date__c est ajouté dans subtree
              if (node.querySelector && node.querySelector("input[id$='Date__c'], input[name$='Date__c'], input[id*='Date__c']")) {
                shouldInit = true;
                break;
              }
            }
          }
        });
        if (shouldInit) {
          setTimeout(initAllDatepickers, 100);
        }
      });
      mo.observe(container, { childList: true, subtree: true });
      log('Started MutationObserver on', containerSelector);
    } catch (err) {
      warn('startMutationObserver error', err);
    }
  }

  // --- Main : ensure jQuery & jQuery UI then wire handlers ---
  function mainInit() {
    log('Main init start : jQuery version =', window.jQuery ? jQuery.fn.jquery : 'NONE', ' jQuery UI?', !!(window.jQuery && jQuery.ui && jQuery.ui.datepicker));

    // 1) inject CSS
    insertCssIfMissing(JQUERY_UI_CSS);

    // 2) init datepickers now
    initAllDatepickers();

    // 3) Delegated handlers (survive DOM replacements)
    // date change
    jQuery(document).off('change.fsDate', "input[id$='Date__c'], input[name$='Date__c'], input[id*='Date__c']").on('change.fsDate', "input[id$='Date__c'], input[name$='Date__c'], input[id*='Date__c']", function () {
      validateEventDate(this);
    });
    // duration change
    jQuery(document).off('change.fsDuration', "#crgchr_Inscription__c\\.HeureDebTxt__c, #crgchr_Inscription__c\\.HeureFinTxt__c")
      .on('change.fsDuration', "#crgchr_Inscription__c\\.HeureDebTxt__c, #crgchr_Inscription__c\\.HeureFinTxt__c", function () {
        validateEventDuration();
      });

    // translate labels & bind repeatable
    try { translateLabels(); } catch (e) { /* ignore */ }
    try { BindClickHandlers(); } catch (e) { /* ignore */ }

    // start MutationObserver to catch Formstack dynamic replacements
    startMutationObserver(FORM_CONTAINER_SELECTOR);
  }

  // If jQuery exists and jQuery UI exists -> init directly
  if (window.jQuery && window.jQuery.ui && window.jQuery.ui.datepicker) {
    mainInit();
  } else {
    // Ensure jQuery present first, then jQuery UI, then init
    (function ensureJQueryAndUI(cb) {
      function whenReady() {
        if (window.jQuery && window.jQuery.ui && window.jQuery.ui.datepicker) return cb();
        setTimeout(whenReady, 50);
      }
      if (!window.jQuery) {
        loadScriptOnce(JQUERY_SRC, function () { loadScriptOnce(JQUERY_UI_SRC, whenReady); });
      } else {
        loadScriptOnce(JQUERY_UI_SRC, whenReady);
      }
    })(function () {
      // give slight delay for scripts to attach
      setTimeout(function () {
        try {
          mainInit();
        } catch (e) {
          warn('mainInit failed', e);
        }
      }, 80);
    });
  }

  // Expose some helpers for debugging
  window.__fs_debug_helpers = {
    initAllDatepickers: initAllDatepickers,
    validateEventDate: validateEventDate,
    validateEventDuration: validateEventDuration
  };

  log('Formstack robust script loaded.');

})();
