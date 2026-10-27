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

// Self-hosted Noto Sans (STADA brand font). No Google Fonts: a doctor's IP must not go to third parties.
const FONT_FACES = [
  ['latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
  ['cyrillic', 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'],
  ['cyrillic-ext', 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F'],
].flatMap(([subset, range]) => [400, 600].map((w) =>
  `@font-face{font-family:'Noto Sans';font-style:normal;font-weight:${w};font-display:swap;` +
  `src:url(/brand/fonts/noto-sans-${subset}-${w}-normal.woff2) format('woff2');unicode-range:${range}}`)).join('');

// STADA identity: blue #005DB9 (primary), rubine #D50058 (accent), grey #828895, intersecting gradient circles.
const BASE_STYLE = `${FONT_FACES}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:#fff;color:#22262e;font-family:'Noto Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
  .wrap{display:flex;flex-direction:column;height:100%}
  iframe{flex:1;width:100%;border:0;background:#fff}
  .bar{height:34px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;
       background:#fff;border-top:1px solid #e3e6ec;color:#828895;font-size:11px;white-space:nowrap;overflow:hidden}
  .bar .right{display:flex;align-items:center;gap:12px}
  .bar img{height:20px;width:auto;display:block}
  .gate{position:fixed;inset:0;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:flex-end;padding:24px}
  .circle{position:absolute;border-radius:50%;pointer-events:none}
  .c1{width:78vmax;height:78vmax;left:-30vmax;top:-34vmax;background:linear-gradient(120deg,rgba(0,93,185,.03),rgba(0,93,185,.78))}
  .c2{width:62vmax;height:62vmax;left:-24vmax;top:6vmax;background:linear-gradient(200deg,rgba(0,93,185,.02),rgba(0,93,185,.55))}
  .card{position:relative;max-width:440px;width:100%;margin-right:6vw;line-height:1.55}
  .card img{height:58px;width:auto;display:block;margin:0 0 28px}
  .card h1{font-size:26px;font-weight:400;line-height:1.25;color:#005db9;margin:0 0 14px}
  .card p{margin:0 0 24px;color:#4a4f5a;font-size:15px}
  .card button{display:block;width:100%;padding:14px 22px;border:0;border-radius:999px;background:#005db9;color:#fff;
       font:600 15px/1.3 'Noto Sans',system-ui,sans-serif;cursor:pointer}
  .card button:hover{background:#004b96}
  .card button:focus-visible{outline:3px solid #d50058;outline-offset:3px}
  .card .small{font-size:12px;color:#828895;margin:16px 0 0}
  @media (max-width:700px){
    .gate{align-items:flex-end;justify-content:center;padding:20px 20px 32px}
    .c1{width:120vw;height:120vw;left:-40vw;top:-50vw}.c2{width:95vw;height:95vw;left:20vw;top:-30vw}
    .card{margin:0;background:rgba(255,255,255,.94);border-radius:18px;padding:4px 0 0}
    .card h1{font-size:22px}
  }`;

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
  <div class="bar"><span>Только для специалистов здравоохранения</span>
    <span class="right">${approvalCode ? '<span>Код: ' + escapeHtml(approvalCode) + '</span>' : ''}<img src="/brand/stada-logo.png" alt="STADA"></span></div>
</div>
${hcpGate ? `<div class="gate" id="gate">
  <div class="circle c1" aria-hidden="true"></div><div class="circle c2" aria-hidden="true"></div>
  <div class="card">
    <img src="/brand/stada-logo.png" alt="STADA">
    <h1>Информация для специалистов здравоохранения</h1>
    <p>Материал содержит сведения о рецептурном лекарственном препарате и предназначен только для медицинских и фармацевтических работников.</p>
    <button id="confirm" type="button">Я специалист здравоохранения, открыть материал</button>
    <p class="small">Эта ссылка персональная. Пожалуйста, не пересылайте её.</p>
  </div>
</div>` : ''}
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
<body><div class="gate">
<div class="circle c1" aria-hidden="true"></div><div class="circle c2" aria-hidden="true"></div>
<div class="card"><img src="/brand/stada-logo.png" alt="STADA"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></div>
</div></body></html>`;
}
