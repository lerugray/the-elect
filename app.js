/* ============================================================
   THE ELECT — app.js
   Loads ASCII portraits from assets/ and injects into cards.
   No external dependencies. Offline-safe.
   ============================================================ */

/* ── CONFIG ──────────────────────────────────────────────────
   SUPPORT_URL: paste a Stripe Payment Link, Ko-fi URL, or any
   patron URL here to activate the "Support the lab" CTA.
   Leave empty ('') and the CTA stays invisible — nothing shows.
   ──────────────────────────────────────────────────────────── */
var SUPPORT_URL = 'https://donate.stripe.com/cNi4gzb8TduS8pia2jes004';

(function() {

  // Map of element ID -> asset path
  const PORTRAITS = [
    { id: 'eschaton-ascii', path: './assets/eschaton-face.txt' },
    { id: 'marx-ascii',     path: './assets/marx-ascii.txt'   },
  ];

  function loadAscii(id, path) {
    const el = document.getElementById(id);
    if (!el) return;

    fetch(path)
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function(text) {
        el.textContent = text;
      })
      .catch(function(err) {
        // Fail silently — placeholder text stays
        el.textContent = '[portrait withheld]';
        console.warn('The Elect: failed to load', path, err.message);
      });
  }

  // Load all portraits once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    PORTRAITS.forEach(function(p) {
      loadAscii(p.id, p.path);
    });

    // ── SUPPORT CTA — activate only when SUPPORT_URL is set ──
    if (SUPPORT_URL) {
      // About-section card
      var ctaAbout = document.getElementById('support-cta-about');
      if (ctaAbout) {
        ctaAbout.href = SUPPORT_URL;
        ctaAbout.classList.add('is-visible');
      }
      // Footer link
      var footerLine = document.getElementById('footer-support-line');
      var footerLink = document.getElementById('footer-support-link');
      if (footerLine && footerLink) {
        footerLink.href = SUPPORT_URL;
        footerLine.style.display = '';
      }
    }

    // ── SUGGEST-A-VOICE FORM — mailto on submit ──
    var suggestForm = document.getElementById('suggest-form');
    if (suggestForm) {
      suggestForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var figure = (document.getElementById('suggest-name').value || '').trim();
        var why    = (document.getElementById('suggest-why').value  || '').trim();
        if (!figure) {
          document.getElementById('suggest-name').focus();
          return;
        }
        var subject = encodeURIComponent('Elect voice suggestion: ' + figure);
        var body    = encodeURIComponent(
          'Figure: ' + figure + '\n\n' +
          'Why they belong:\n' + (why || '(no reason given)')
        );
        window.location.href =
          'mailto:rweiss@consimsltd.com?subject=' + subject + '&body=' + body;
      });
    }

    // Subtle: add a blinking cursor effect to the site title
    var title = document.querySelector('.site-title');
    if (title) {
      var cursor = document.createElement('span');
      cursor.setAttribute('aria-hidden', 'true');
      cursor.style.cssText = [
        'display: inline-block',
        'width: 0.12em',
        'height: 1em',
        'background: var(--gold)',
        'margin-left: 0.15em',
        'vertical-align: middle',
        'opacity: 0',
        'animation: blink-cursor 1.2s step-end infinite'
      ].join(';');

      // Inject keyframe if not already present
      if (!document.getElementById('elect-cursor-style')) {
        var style = document.createElement('style');
        style.id = 'elect-cursor-style';
        style.textContent = '@keyframes blink-cursor { 0%,100%{opacity:0} 50%{opacity:1} }';
        document.head.appendChild(style);
      }

      title.appendChild(cursor);
    }
  }

})();
