/**
 * /embed.js – bindet termind in beliebige Webseiten ein (ohne Abhängigkeiten).
 *
 *   <script src="https://termine.example.de/embed.js" defer></script>
 *   <div data-termind="lena/erstgespraech"></div>                          inline
 *   <button data-termind="lena/workshop" data-mode="popup">Termin</button> popup
 *   <div data-termind="lena" data-mode="floating" data-label="Termin buchen"></div>
 *
 * Optionale Attribute: data-theme="light|dark", data-lang="de|en", data-color="#1d6f63"
 */
export const EMBED_JS = String.raw`(function () {
  if (window.termind && window.termind.__loaded) return;
  var script = document.currentScript;
  var ORIGIN = new URL(script ? script.src : location.href).origin;
  var frames = [];

  function pageUrl(path, el) {
    // Nur einfache Pfade wie "name/terminseite" zulassen, nie eine fremde Adresse
    var clean = String(path || '').toLowerCase().replace(/[^a-z0-9\/-]/g, '').replace(/\/{2,}/g, '/').replace(/^\/+/, '');
    var u = new URL('/' + clean, ORIGIN);
    if (u.origin !== ORIGIN) return ORIGIN + '/';
    u.searchParams.set('embed', '1');
    ['theme', 'lang'].forEach(function (k) { var v = el && el.getAttribute('data-' + k); if (v && /^[a-z]{2,5}$/.test(v)) u.searchParams.set(k, v); });
    return u.href;
  }

  function makeFrame(src, minHeight) {
    var f = document.createElement('iframe');
    f.src = src;
    f.title = 'Termin buchen';
    f.setAttribute('loading', 'lazy');
    f.style.cssText = 'display:block;width:100%;border:0;background:transparent;min-height:' + (minHeight || 480) + 'px;transition:height .2s ease';
    frames.push(f);
    return f;
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data !== 'object') return;
    frames.forEach(function (f) {
      if (f.contentWindow !== e.source) return;
      if (e.data.type === 'termind:height') f.style.height = Math.min(20000, Math.ceil(Number(e.data.height) || 0)) + 'px';
      if (e.data.type === 'termind:close') close();
      if (e.data.type === 'termind:booked') {
        var ev = new CustomEvent('termind:booked', { detail: e.data, bubbles: true });
        (f.closest('[data-termind]') || document).dispatchEvent(ev);
      }
    });
  });

  var open = null;
  function openPopup(path, el) {
    close();
    var lastFocus = document.activeElement;
    var overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Termin buchen');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,18,15,.45);display:flex;align-items:center;justify-content:center;padding:12px;opacity:0;transition:opacity .18s ease';
    var box = document.createElement('div');
    box.style.cssText = 'position:relative;width:100%;max-width:1080px;max-height:calc(100dvh - 24px);overflow:auto;border-radius:16px;background:#fff;box-shadow:0 24px 64px -16px rgba(0,0,0,.4);transform:translateY(8px) scale(.98);transition:transform .22s cubic-bezier(.23,1,.32,1)';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Schließen');
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    btn.style.cssText = 'position:absolute;top:10px;right:10px;z-index:2;width:36px;height:36px;border:0;border-radius:10px;background:rgba(0,0,0,.05);color:#333;cursor:pointer;display:flex;align-items:center;justify-content:center';
    var frame = makeFrame(pageUrl(path, el), 560);
    box.appendChild(btn);
    box.appendChild(frame);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { overlay.style.opacity = '1'; box.style.transform = 'none'; });
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    btn.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    btn.focus();
    open = function () {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = prevOverflow;
      frames = frames.filter(function (f) { return f !== frame; });
      overlay.remove();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
  }
  function close() { if (open) { var f = open; open = null; f(); } }

  function init(root) {
    (root || document).querySelectorAll('[data-termind]:not([data-termind-ready])').forEach(function (el) {
      el.setAttribute('data-termind-ready', '');
      var path = el.getAttribute('data-termind');
      var mode = el.getAttribute('data-mode') || 'inline';
      if (mode === 'popup') {
        el.addEventListener('click', function (e) { e.preventDefault(); openPopup(path, el); });
      } else if (mode === 'floating') {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = el.getAttribute('data-label') || 'Termin buchen';
        var color = el.getAttribute('data-color') || '';
        if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) color = '#1d6f63';
        b.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147482000;height:48px;padding:0 20px;border:0;border-radius:999px;background:' + color + ';color:#fff;font:600 15px/1 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px -6px rgba(0,0,0,.35);cursor:pointer;transition:transform .16s ease';
        b.addEventListener('pointerdown', function () { b.style.transform = 'scale(.97)'; });
        b.addEventListener('pointerup', function () { b.style.transform = ''; });
        b.addEventListener('pointerleave', function () { b.style.transform = ''; });
        b.addEventListener('click', function () { openPopup(path, el); });
        document.body.appendChild(b);
      } else {
        el.appendChild(makeFrame(pageUrl(path, el)));
      }
    });
  }

  window.termind = { __loaded: true, init: init, open: function (path) { openPopup(path, null); }, close: close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})();
`
