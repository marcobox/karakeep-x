// Read a post — and on its own status page, the author's thread — out of the rendered DOM.
//
// Pure DOM reading: no network, no storage, no sanitising (format.js sanitises, in the background,
// where the capture crosses into Karakeep). Everything read here is UNTRUSTED text written by
// whoever posted it; it is only ever carried as data.
//
// A selector that matches nothing where something is required throws a SelectorError naming the
// key in selectors.js, so the button can say which assumption about X's markup broke instead of
// saving an empty bookmark.
(function () {
  const g = globalThis;
  const KX = (g.KX = g.KX || {});
  const S = KX.SELECTORS;
  const parseStatusPath = KX.parseStatusPath;
  const CAPTURE_SCHEMA = 'karakeep-x/1';

  class SelectorError extends Error {
    constructor(key, detail) {
      super(`X markup changed? selector "${key}" (${S[key] || key}) ${detail}`);
      this.name = 'SelectorError';
      this.key = key;
    }
  }

  function hrefPath(a) {
    const href = a && a.getAttribute('href');
    if (!href) return null;
    try {
      return new URL(href, 'https://x.com').pathname;
    } catch {
      return null;
    }
  }

  // The quoted post's container inside `root`, or null. The FIRST User-Name block in an article is
  // its author's; a second one belongs to the quoted post, and its nearest role=link block that does
  // not also hold the first is the quote.
  function findQuote(root) {
    const names = root.querySelectorAll(S.userName);
    if (names.length < 2) return null;
    const container = names[1].closest(S.quoteContainer);
    if (!container || !root.contains(container) || container.contains(names[0])) return null;
    return container;
  }

  // Elements under `root` matching `sel` that are not inside `exclude` (the quoted post).
  function ownAll(root, sel, exclude) {
    return Array.from(root.querySelectorAll(sel)).filter((el) => !(exclude && exclude.contains(el)));
  }
  function own(root, sel, exclude) {
    return ownAll(root, sel, exclude)[0] || null;
  }

  // Visible text of an element: text nodes, <br> as a newline, emoji <img> as their alt. Links keep
  // their visible text, minus X's trailing ellipsis on shortened URLs, and are collected.
  function readText(el, links) {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        out += node.nodeValue;
      } else if (node.nodeType === 1) {
        const tag = node.tagName;
        if (tag === 'BR') out += '\n';
        else if (tag === 'IMG') out += node.getAttribute('alt') || '';
        else if (tag === 'A') {
          let t = readText(node, null);
          if (/^https?:\/\//.test(t)) t = t.replace(/…$/, '');
          if (links) links.push({ text: t, href: node.getAttribute('href') || '' });
          out += t;
        } else out += readText(node, links);
      }
    }
    return out;
  }

  function collapse(s) {
    return s.replace(/\s+/g, ' ').trim();
  }

  // pbs.twimg.com media URL at a given size: format kept, name replaced. Other URLs unchanged.
  function mediaUrl(src, name) {
    try {
      const u = new URL(src);
      if (u.hostname !== 'pbs.twimg.com') return src;
      if (u.pathname.startsWith('/media/')) {
        u.searchParams.set('name', name);
        if (!u.searchParams.get('format')) {
          const ext = /\.(jpe?g|png|webp|gif)$/i.exec(u.pathname);
          if (ext) {
            u.pathname = u.pathname.slice(0, -ext[0].length);
            u.searchParams.set('format', ext[1].toLowerCase());
          }
        }
      }
      return u.toString();
    } catch {
      return src;
    }
  }

  function readAuthor(root, exclude, permalink) {
    const block = own(root, S.userName, exclude);
    if (!block) return null;
    let handle = null;
    for (const a of block.querySelectorAll('a[href]')) {
      const t = collapse(a.textContent || '');
      if (t.startsWith('@')) {
        handle = t.slice(1);
        break;
      }
    }
    if (!handle) {
      // A quoted post's header has no links: "@handle" is a plain span.
      const m = /@([A-Za-z0-9_]{1,15})/.exec(block.textContent || '');
      if (m) handle = m[1];
    }
    if (!handle && permalink) handle = permalink.handle;
    // The display name: the first link (a post header) or, in a quote header, the outermost span
    // that does not also hold the @handle or the time. Document order puts wrappers first.
    let name = '';
    const firstLink = block.querySelector('a[href]');
    if (firstLink) name = collapse(readText(firstLink, null));
    if (!name || name.startsWith('@')) {
      name = '';
      for (const span of block.querySelectorAll('span')) {
        const t = collapse(readText(span, null));
        if (t && !t.includes('@') && t !== '·' && !span.querySelector('time')) {
          name = t;
          break;
        }
      }
    }
    return { handle, name };
  }

  // One post under `root`. `quoteEl` is excluded from every lookup; `requireLink` is false for a
  // quoted post, which X often renders without a permalink.
  function readPost(root, quoteEl, requireLink) {
    const timeEl = own(root, S.time, quoteEl);
    let permalink = null;
    if (timeEl) permalink = parseStatusPath(hrefPath(timeEl.closest('a[href]')));
    if (!permalink) {
      for (const a of ownAll(root, 'a[href]', quoteEl)) {
        const p = parseStatusPath(hrefPath(a));
        if (p && p.handle) {
          permalink = p;
          break;
        }
      }
    }
    const author = readAuthor(root, quoteEl, permalink);
    if (!author || !author.handle) {
      if (requireLink) throw new SelectorError('userName', 'matched no author handle');
    }
    if (!permalink && requireLink) throw new SelectorError('time', 'matched no permalink');

    const handle = (author && author.handle) || (permalink && permalink.handle) || null;
    const id = permalink ? permalink.id : null;

    const textEl = own(root, S.text, quoteEl);
    const links = [];
    const text = textEl ? readText(textEl, links).replace(/ /g, ' ').trim() : '';
    const showMore = own(root, S.showMore, quoteEl);

    const media = [];
    for (const img of ownAll(root, S.photo, quoteEl)) {
      const src = img.getAttribute('src');
      if (!src) continue;
      const alt = img.getAttribute('alt');
      media.push({
        type: 'image',
        url: mediaUrl(src, 'orig'),
        fetchUrl: mediaUrl(src, 'large'),
        alt: alt && alt !== 'Image' ? alt : null,
      });
    }
    for (const v of ownAll(root, S.video, quoteEl)) {
      const src = v.getAttribute('src') || (v.querySelector('source') && v.querySelector('source').getAttribute('src'));
      const poster = v.getAttribute('poster');
      const isHttp = !!src && /^https:\/\//.test(src);
      media.push({
        type: isHttp && /\/tweet_video\//.test(src) ? 'gif' : 'video',
        url: isHttp ? src : null,
        poster: poster || null,
        fetchUrl: poster ? mediaUrl(poster, 'large') : null,
      });
    }

    let card = null;
    const cardEl = own(root, S.card, quoteEl);
    if (cardEl) {
      const a = cardEl.querySelector('a[href]');
      // Leaf texts (domain, title, description) joined; run together they read as one word.
      const parts = Array.from(cardEl.querySelectorAll('*'))
        .filter((el) => !el.children.length)
        .map((el) => collapse(el.textContent || ''))
        .filter(Boolean);
      card = { href: a ? a.getAttribute('href') : null, text: parts.join(' · ') };
    }

    const timeIso = timeEl ? timeEl.getAttribute('datetime') : null;
    const social = own(root, S.socialContext, quoteEl);
    return {
      id,
      url: id ? `https://x.com/${handle || 'i'}/status/${id}` : null,
      author: { handle, name: (author && author.name) || '' },
      postedAt: timeIso,
      text,
      textComplete: !showMore,
      lang: textEl ? textEl.getAttribute('lang') : null,
      links,
      media,
      card,
      socialContext: social ? collapse(social.textContent || '') : null,
    };
  }

  // A post article → a post object with its quoted post (if any). Throws SelectorError.
  function readArticle(article) {
    const quoteEl = findQuote(article);
    const post = readPost(article, quoteEl, true);
    post.quoted = quoteEl ? readPost(quoteEl, null, false) : null;
    if (!post.text && !post.media.length && !post.card && !post.quoted) {
      throw new SelectorError('text', 'matched no text, and no media, card or quote either');
    }
    return post;
  }

  function sameAuthor(a, b) {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
  }

  // Capture what the user asked to save. On the post's own status page, also the author's thread:
  // the contiguous run of articles by the same author around it. X renders a virtualised list, so
  // the run is only what is in the DOM; `threadAtEdge` says the run touched the first or last
  // rendered article and may continue off-screen.
  function capture(article, doc, loc) {
    const focal = readArticle(article);
    const warnings = [];
    let thread = null;
    let threadAtEdge = false;
    const page = parseStatusPath(loc.pathname);
    if (page && page.id === focal.id) {
      const col = doc.querySelector(S.primaryColumn) || doc;
      const all = Array.from(col.querySelectorAll(S.post));
      const at = all.indexOf(article);
      if (at >= 0) {
        const run = [focal];
        let lo = at;
        let hi = at;
        const step = (dir) => {
          for (let i = at + dir; i >= 0 && i < all.length; i += dir) {
            let p;
            try {
              p = readArticle(all[i]);
            } catch (e) {
              warnings.push(`thread: stopped at an unreadable post (${e.message})`);
              return;
            }
            if (!sameAuthor(p.author.handle, focal.author.handle)) return;
            if (dir < 0) {
              run.unshift(p);
              lo = i;
            } else {
              run.push(p);
              hi = i;
            }
          }
        };
        step(-1);
        step(1);
        if (run.length > 1) {
          thread = run;
          threadAtEdge = lo === 0 || hi === all.length - 1;
        }
      }
    }
    if (!focal.textComplete) {
      warnings.push('text truncated by X ("Show more"): open the post and save it again for the full text');
    }
    return {
      schema: CAPTURE_SCHEMA,
      capturedAt: new Date().toISOString(),
      pageUrl: `${loc.origin}${loc.pathname}`,
      kind: thread ? 'thread' : 'post',
      focal,
      thread,
      threadAtEdge,
      warnings,
    };
  }

  // A truncated long post whose "Show more" is an inline button (not a link): click it and wait
  // for the full text. Resolves true if the text is complete afterwards.
  function expandInline(article, timeoutMs) {
    const quoteEl = findQuote(article);
    const btn = own(article, S.showMore, quoteEl);
    if (!btn) return Promise.resolve(true);
    if (btn.tagName === 'A' && btn.getAttribute('href')) return Promise.resolve(false);
    btn.click();
    const deadline = Date.now() + (timeoutMs || 2500);
    return new Promise((resolve) => {
      const tick = () => {
        if (!own(article, S.showMore, findQuote(article))) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  Object.assign(KX, { SelectorError, parseStatusPath, findQuote, readArticle, capture, expandInline, mediaUrl, CAPTURE_SCHEMA });
})();
