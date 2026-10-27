// Builds the pages a doctor sees when opening a tracked link.
//
// Security model: an uploaded deck is untrusted HTML. It is served with a
// `Content-Security-Policy: sandbox` header and loaded in a sandboxed iframe, so it
// runs in an opaque origin and cannot read platform cookies or call the API as a
// signed-in user. The deck only reports "which slide is showing" to the wrapper page
// via postMessage; the wrapper (our own code) does the tracking.

export const DECK_CSP = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Injected into the deck. Detects the visible slide in most HTML decks without any
// changes to the deck. Decks can also report slides explicitly:
//   window.StadaTrack && window.StadaTrack.slide(index, total)   // index is 0-based
const REPORTER = `
(function () {
  if (window.parent === window) return;
  var explicit = null;
  window.StadaTrack = { slide: function (i, total) { explicit = { i: i | 0, t: total | 0 }; } };
  var SELECTORS = ['[data-slide]', '.slide', '.slides > section', '.reveal section', 'section'];
  function candidates() {
    for (var s = 0; s < SELECTORS.length; s++) {
      var list = Array.prototype.slice.call(document.querySelectorAll(SELECTORS[s]));
      // keep only top-level matches (ignore sections nested inside another slide)
      list = list.filter(function (el) {
        for (var p = el.parentElement; p; p = p.parentElement) if (list.indexOf(p) !== -1) return false;
        return true;
      });
      if (list.length >= 2) return list;
    }
    return [];
  }
  function visibleArea(el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return 0;
    var r = el.getBoundingClientRect();
    var w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    var h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }
  function current() {
    if (explicit) return explicit;
    var list = candidates();
    if (!list.length) {
      var m = (location.hash || '').match(/(\\d+)/);
      return { i: m ? Math.max(0, parseInt(m[1], 10) - 1) : 0, t: 0 };
    }
    var best = 0, bestScore = -1;
    for (var i = 0; i < list.length; i++) {
      var score = visibleArea(list[i]);
      if (/\\b(active|current|present)\\b/.test(list[i].className || '')) score *= 1.5;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return { i: best, t: list.length };
  }
  function report() {
    try { var c = current(); window.parent.postMessage({ type: 'stada:slide', index: c.i, total: c.t }, '*'); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', report); else report();
  setInterval(report, 1000);
})();`;

export function injectReporter(html) {
  const tag = `<script>${REPORTER}</script>`;
  const idx = html.toLowerCase().lastIndexOf('</body>');
  return idx === -1 ? html + tag : html.slice(0, idx) + tag + html.slice(idx);
}

const BASE_STYLE = `
  *{box-sizing:border-box}html,body{margin:0;height:100%;background:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .wrap{display:flex;flex-direction:column;height:100%}
  iframe{flex:1;width:100%;border:0;background:#fff}
  .bar{height:26px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 12px;
       background:#0f172a;color:#cbd5e1;font-size:11px;white-space:nowrap;overflow:hidden}
  .gate{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:#0f172a}
  .card{max-width:440px;background:#fff;border-radius:14px;padding:28px;color:#0f172a;line-height:1.5}
  .card h1{font-size:19px;margin:0 0 10px}.card p{margin:0 0 18px;color:#334155;font-size:15px}
  .card button{width:100%;padding:13px;border:0;border-radius:10px;background:#0d7a63;color:#fff;font-size:15px;cursor:pointer}
  .card .small{font-size:12px;color:#64748b;margin:14px 0 0}`;

export function wrapperPage({ token, title, approvalCode, hcpGate }) {
  const t = escapeHtml(title);
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${t}</title><style>${BASE_STYLE}</style></head>
<body>
<div class="wrap">
  <iframe id="deck" title="${t}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" allow="fullscreen"></iframe>
  <div class="bar"><span>Только для специалистов здравоохранения</span><span>${approvalCode ? 'Код: ' + escapeHtml(approvalCode) : ''}</span></div>
</div>
${hcpGate ? `<div class="gate" id="gate"><div class="card">
  <h1>Информация для специалистов здравоохранения</h1>
  <p>Материал содержит сведения о рецептурном лекарственном препарате и предназначен только для медицинских и фармацевтических работников.</p>
  <button id="confirm" type="button">Я специалист здравоохранения — открыть</button>
  <p class="small">Эта ссылка персональная. Пожалуйста, не пересылайте её.</p>
</div></div>` : ''}
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var frame = document.getElementById('deck');
  var key = 'stada_s_' + TOKEN, session;
  try { session = sessionStorage.getItem(key); } catch (e) {}
  if (!session) {
    session = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    try { sessionStorage.setItem(key, session); } catch (e) {}
  }
  var started = false, current = 0, total = 0, pending = {};

  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || d.type !== 'stada:slide') return;
    if (typeof d.index === 'number' && d.index >= 0 && d.index < 500) current = Math.floor(d.index);
    if (typeof d.total === 'number' && d.total >= 0 && d.total < 500) total = Math.floor(d.total);
  });

  setInterval(function () {
    if (!started || document.visibilityState !== 'visible') return;
    pending[current] = (pending[current] || 0) + 1;
  }, 1000);

  function flush(final) {
    if (!Object.keys(pending).length) return;
    var body = JSON.stringify({ token: TOKEN, session: session, slides: pending, total: total });
    pending = {};
    if (final && navigator.sendBeacon) { navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' })); return; }
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
  }
  setInterval(flush, 10000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', function () { flush(true); });

  function start() {
    var gate = document.getElementById('gate');
    if (gate) gate.remove();
    frame.src = '/v/' + encodeURIComponent(TOKEN) + '/deck';
    frame.addEventListener('load', function () { try { frame.focus(); } catch (e) {} });
    started = true;
    setTimeout(flush, 3000);
  }
  var btn = document.getElementById('confirm');
  if (btn) btn.addEventListener('click', start); else start();
})();
</script>
</body></html>`;
}

export function messagePage(title, text) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title><style>${BASE_STYLE}</style></head>
<body><div class="gate"><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></div></div></body></html>`;
}
