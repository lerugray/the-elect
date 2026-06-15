/* ============================================================
   THE ELECT — app.js
   Loads ASCII portraits from assets/ and injects into cards.
   No external dependencies. Offline-safe.
   ============================================================ */

(function() {

  // Map of element ID -> asset path
  const PORTRAITS = [
    { id: 'eschaton-ascii', path: './assets/eschaton-face.txt' },
    { id: 'muntzer-ascii',  path: './assets/muntzer-ascii.txt' },
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
