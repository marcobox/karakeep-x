// The save button on every post. Runs on x.com / twitter.com in the extension's isolated world.
//
// Clicking captures the post from the DOM (extract.js) and hands it to the service worker, which
// alone holds the Karakeep key. Nothing here reads X's API, cookies or storage.
//
// When X's markup moves, the failure is made visible rather than silent: a post the extension
// cannot read shows an error on its button naming the selector, and a status page on which no
// post is recognised at all puts a red "!" on the toolbar icon.
(function () {
  const KX = globalThis.KX;
  const S = KX.SELECTORS;
  const MARK = 'data-kx';
  const SVG = 'http://www.w3.org/2000/svg';

  function icon() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('kx-icon');
    const path = document.createElementNS(SVG, 'path');
    // A bookmark with a plus: "keep this".
    path.setAttribute('d', 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1zm5 4v3H8v2h3v3h2v-3h3v-2h-3V7z');
    svg.appendChild(path);
    return svg;
  }

  function setState(ui, state, label, detail) {
    ui.btn.dataset.state = state;
    ui.label.textContent = label || '';
    ui.btn.title = detail ? `Karakeep: ${detail}` : 'Save to Karakeep';
    ui.btn.setAttribute('aria-label', ui.btn.title);
    ui.btn.disabled = state === 'busy';
  }

  let reported = null;
  function reportMarkup(broken, detail) {
    const key = broken ? `broken:${detail}` : 'ok';
    if (reported === key) return;
    reported = key;
    try {
      chrome.runtime.sendMessage({ type: 'markup', broken, detail: detail || '' });
    } catch {
      /* extension reloaded underneath this tab */
    }
  }

  async function onClick(ev, article, ui) {
    ev.preventDefault();
    ev.stopPropagation();
    if (ui.btn.dataset.state === 'busy') return;
    setState(ui, 'busy', 'Saving…', 'saving');
    let capture;
    try {
      await KX.expandInline(article, 2500);
      capture = KX.capture(article, document, location);
    } catch (e) {
      const detail = e && e.name === 'SelectorError' ? e.message : `could not read this post: ${e && e.message}`;
      if (e && e.name === 'SelectorError') reportMarkup(true, e.message);
      setState(ui, 'error', 'Can’t read post', detail);
      return;
    }
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'save', capture });
    } catch (e) {
      setState(ui, 'error', 'Error', 'the extension was reloaded or updated: reload this tab');
      return;
    }
    if (!res || !res.ok) {
      setState(ui, 'error', 'Error', (res && res.error) || 'no answer from the extension');
      return;
    }
    const r = res.result;
    const what = r.kind === 'thread' ? `thread of ${r.posts} posts` : 'post';
    if (!r.textComplete) {
      setState(ui, 'warn', 'Saved (truncated)', `${what} saved, but X showed only part of the text — open the post and save again`);
    } else {
      setState(ui, 'done', r.created ? 'Saved' : 'Updated', `${what} ${r.created ? 'saved' : 'updated'}`);
    }
    ui.open.href = r.link;
    ui.open.hidden = false;
  }

  function inject(article) {
    if (article.hasAttribute(MARK)) return;
    article.setAttribute(MARK, '1');
    const quote = KX.findQuote(article);
    const bars = Array.from(article.querySelectorAll(S.actionBar)).filter((b) => !(quote && quote.contains(b)));
    const bar = bars[bars.length - 1];

    const wrap = document.createElement('div');
    wrap.className = 'kx-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kx-btn';
    const label = document.createElement('span');
    label.className = 'kx-label';
    btn.append(icon(), label);
    const open = document.createElement('a');
    open.className = 'kx-open';
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'open ↗';
    open.hidden = true;
    open.addEventListener('click', (e) => e.stopPropagation());
    wrap.append(btn, open);
    const ui = { btn, label, open };
    btn.addEventListener('click', (e) => onClick(e, article, ui));

    if (bar) {
      bar.appendChild(wrap);
      setState(ui, 'idle', '', null);
    } else {
      // No action bar where one is expected: still offer the button, and say what is off.
      wrap.classList.add('kx-orphan');
      article.appendChild(wrap);
      setState(ui, 'idle', 'Karakeep', `selector "actionBar" matched nothing on this post; saving may still work`);
      reportMarkup(true, 'selector "actionBar" matched nothing');
    }
  }

  // A status page always renders its post. If none is recognised after X has had time to render,
  // the "post" selector itself is broken — the one failure no button can show. Checked once per
  // path; X navigates in-page, and every navigation mutates the DOM, so the scan sees it.
  let checkedPath = null;
  function watchStatusPage() {
    if (location.pathname === checkedPath) return;
    checkedPath = location.pathname;
    if (!KX.parseStatusPath(checkedPath)) return;
    const path = checkedPath;
    setTimeout(() => {
      if (location.pathname === path && !document.querySelector(S.post)) {
        reportMarkup(true, `selector "post" (${S.post}) matched nothing on a status page`);
      }
    }, 10000);
  }

  let scheduled = false;
  function scan() {
    scheduled = false;
    const posts = document.querySelectorAll(S.post);
    posts.forEach(inject);
    if (posts.length) reportMarkup(false);
    watchStatusPage();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
