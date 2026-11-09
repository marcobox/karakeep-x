// What extract.js reads out of X's markup, against the fixtures in test/fixtures/.
//
// The scar this guards: an extension that saves a bookmark whatever the DOM looked like — an empty
// note, a wrong author, a quoted post's text as the post's own — and nobody notices until an agent
// reads garbage weeks later. So each field is pinned, and the broken fixture must THROW, naming
// the selector, rather than save less.
import './guard.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureNames, loadDom } from './helpers.mjs';

const loc = (path) => ({ origin: 'https://x.com', pathname: path });
// jsdom objects come from another realm; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

test('corpus: fixtures exist and each holds posts', () => {
  const names = fixtureNames();
  const counts = names.map((n) => {
    const { document, window, KX } = loadDom(n, 'https://x.com/home');
    const c = document.querySelectorAll(KX.SELECTORS.post).length;
    window.close();
    return `${n}=${c}`;
  });
  console.log(`corpus: ${names.length} fixture(s): ${counts.join(', ')}`);
  assert.ok(names.length >= 3, 'expected at least the timeline, status-thread and broken fixtures');
  for (const c of counts) assert.ok(!c.endsWith('=0'), `fixture with no posts: ${c}`);
});

test('every selector in selectors.js matches something in the fixtures', () => {
  // A selector no fixture exercises is an assumption nothing tests. Add markup for it.
  const docs = fixtureNames().map((n) => loadDom(n, 'https://x.com/home'));
  const keys = Object.keys(docs[0].KX.SELECTORS);
  const unmatched = keys.filter((k) => !docs.some((d) => d.document.querySelector(d.KX.SELECTORS[k])));
  console.log(`corpus: ${keys.length} selector(s) over ${docs.length} fixture(s)`);
  docs.forEach((d) => d.window.close());
  assert.deepEqual(unmatched, [], `selectors with no fixture markup: ${unmatched.join(', ')}`);
});

test('a post: text with links and emoji, author, permalink, photos, card', () => {
  const { document, KX, window } = loadDom('timeline.html', 'https://x.com/home');
  const art = document.querySelectorAll(KX.SELECTORS.post)[0];
  const c = KX.capture(art, document, loc('/home'));
  window.close();
  assert.equal(c.schema, 'karakeep-x/1');
  assert.equal(c.kind, 'post');
  assert.equal(c.thread, null);
  const p = c.focal;
  assert.equal(p.id, '1001');
  assert.equal(p.url, 'https://x.com/alice/status/1001');
  assert.deepEqual(plain(p.author), { handle: 'alice', name: 'Alice 🌱' });
  assert.equal(p.postedAt, '2026-11-01T10:00:00.000Z');
  assert.equal(p.text, 'Hello @bob look at https://example.com/some/long/path\nsecond line 🔥 #test');
  assert.equal(p.textComplete, true);
  assert.equal(p.lang, 'en');
  assert.deepEqual(
    plain(p.links).map((l) => l.href),
    ['/bob', 'https://t.co/abc', '/hashtag/test?src=hashtag_click'],
  );
  assert.equal(p.links[1].text, 'https://example.com/some/long/path');
  assert.deepEqual(plain(p.media), [
    {
      type: 'image',
      url: 'https://pbs.twimg.com/media/AAA111?format=jpg&name=orig',
      fetchUrl: 'https://pbs.twimg.com/media/AAA111?format=jpg&name=large',
      alt: 'A cat on a mat',
    },
    {
      type: 'image',
      url: 'https://pbs.twimg.com/media/BBB222?format=png&name=orig',
      fetchUrl: 'https://pbs.twimg.com/media/BBB222?format=png&name=large',
      alt: null,
    },
  ]);
  assert.deepEqual(plain(p.card), { href: 'https://t.co/card1', text: 'example.org · An article title' });
  assert.equal(p.quoted, null);
});

test('a quoted post is read separately and never leaks into the outer post', () => {
  const { document, KX, window } = loadDom('timeline.html', 'https://x.com/home');
  const art = document.querySelectorAll(KX.SELECTORS.post)[1];
  const p = KX.capture(art, document, loc('/home')).focal;
  window.close();
  assert.equal(p.id, '1002');
  assert.equal(p.author.handle, 'bob');
  assert.equal(p.text, 'This, exactly.');
  assert.equal(p.socialContext, 'Carol reposted');
  assert.deepEqual(plain(p.media), [], 'the quote\'s photo is not the outer post\'s');
  assert.equal(p.quoted.author.handle, 'dave');
  assert.equal(p.quoted.author.name, 'Dave');
  assert.equal(p.quoted.text, 'The quoted words.');
  assert.equal(p.quoted.postedAt, '2026-10-30T12:00:00.000Z');
  assert.equal(p.quoted.id, null, 'X renders the quote without a permalink');
  assert.equal(p.quoted.media.length, 1);
});

test('a "Show more" link marks the text incomplete and warns', async () => {
  const { document, KX, window } = loadDom('timeline.html', 'https://x.com/home');
  const art = document.querySelectorAll(KX.SELECTORS.post)[2];
  assert.equal(await KX.expandInline(art, 200), false, 'a link cannot be expanded in place');
  const c = KX.capture(art, document, loc('/home'));
  window.close();
  assert.equal(c.focal.textComplete, false);
  assert.match(c.warnings.join(' '), /truncated/);
});

test('an inline "Show more" button is clicked and the full text captured', async () => {
  const { document, KX, window } = loadDom('timeline.html', 'https://x.com/home');
  const art = document.getElementById('expandable');
  const btn = art.querySelector(KX.SELECTORS.showMore);
  btn.addEventListener('click', () => {
    window.setTimeout(() => {
      art.querySelector(KX.SELECTORS.text).textContent = 'Start of the long one, and the rest of it.';
      btn.remove();
    }, 50);
  });
  assert.equal(await KX.expandInline(art, 2000), true);
  const c = KX.capture(art, document, loc('/home'));
  window.close();
  assert.equal(c.focal.text, 'Start of the long one, and the rest of it.');
  assert.equal(c.focal.textComplete, true);
  assert.deepEqual(plain(c.warnings), []);
});

test('video (blob stream) and GIF (mp4): poster kept, blob URL dropped', () => {
  const { document, KX, window } = loadDom('timeline.html', 'https://x.com/home');
  const art = document.querySelectorAll(KX.SELECTORS.post)[4];
  const p = KX.capture(art, document, loc('/home')).focal;
  window.close();
  assert.equal(p.text, '');
  assert.deepEqual(plain(p.media), [
    {
      type: 'video',
      url: null,
      poster: 'https://pbs.twimg.com/amplify_video_thumb/55/img/vid.jpg',
      fetchUrl: 'https://pbs.twimg.com/amplify_video_thumb/55/img/vid.jpg',
    },
    {
      type: 'gif',
      url: 'https://video.twimg.com/tweet_video/GIF1.mp4',
      poster: 'https://pbs.twimg.com/tweet_video_thumb/GIF1.jpg',
      fetchUrl: 'https://pbs.twimg.com/tweet_video_thumb/GIF1.jpg',
    },
  ]);
});

test('on its status page, the focal post brings the author\'s contiguous thread', () => {
  const { document, KX, window } = loadDom('status-thread.html', 'https://x.com/Alice_A/status/2002');
  const c = KX.capture(document.getElementById('focal'), document, loc('/Alice_A/status/2002'));
  window.close();
  assert.equal(c.kind, 'thread');
  assert.deepEqual(plain(c.thread.map((p) => p.id)), ['2001', '2002', '2003'], 'zed before, bob and the later alice post after are out');
  assert.equal(c.focal.id, '2002');
  assert.equal(c.focal.text, '2/ The middle post, in full.\n\nWith a second paragraph.');
  assert.equal(c.focal.postedAt, '2026-11-06T08:01:00.000Z', 'the focal post\'s time sits at its bottom');
  assert.equal(c.threadAtEdge, false);
});

test('the same post saved from a timeline is a single post, not a thread', () => {
  const { document, KX, window } = loadDom('status-thread.html', 'https://x.com/home');
  const c = KX.capture(document.getElementById('focal'), document, loc('/home'));
  window.close();
  assert.equal(c.kind, 'post');
  assert.equal(c.thread, null);
});

test('a thread touching the last rendered post says it may continue', () => {
  const { document, KX, window } = loadDom('status-thread.html', 'https://x.com/Alice_A/status/2005');
  const arts = document.querySelectorAll(KX.SELECTORS.post);
  const last = arts[arts.length - 1];
  const c = KX.capture(last, document, loc('/Alice_A/status/2005'));
  window.close();
  // 2005 is alone (bob precedes it), so it is a post; make bob alice's to get a run to the edge.
  assert.equal(c.kind, 'post');
  const again = loadDom('status-thread.html', 'https://x.com/Alice_A/status/2005');
  const a2 = again.document.querySelectorAll(again.KX.SELECTORS.post);
  for (const el of a2[4].querySelectorAll('a[href^="/bob"]')) el.setAttribute('href', el.getAttribute('href').replace('/bob', '/Alice_A'));
  for (const s of a2[4].querySelectorAll('span')) if (s.textContent === '@bob') s.textContent = '@Alice_A';
  const c2 = again.KX.capture(a2[a2.length - 1], again.document, loc('/Alice_A/status/2005'));
  again.window.close();
  assert.equal(c2.kind, 'thread');
  assert.deepEqual(plain(c2.thread.map((p) => p.id)), ['2001', '2002', '2003', '2004', '2005']);
  assert.equal(c2.threadAtEdge, true);
});

test('broken markup throws a SelectorError naming the key — it never saves less', () => {
  const { document, KX, window } = loadDom('broken.html', 'https://x.com/home');
  const cases = { 'no-author': 'userName', 'no-permalink': 'time', 'no-body': 'text' };
  for (const [id, key] of Object.entries(cases)) {
    assert.throws(
      () => KX.capture(document.getElementById(id), document, loc('/home')),
      (e) => e.name === 'SelectorError' && e.key === key && e.message.includes(KX.SELECTORS[key]),
      `#${id} must fail on "${key}"`,
    );
  }
  window.close();
});

test('status paths: handles, the handle-less form, and non-posts', () => {
  const { KX, window } = loadDom('timeline.html', 'https://x.com/home');
  const p = KX.parseStatusPath;
  assert.deepEqual({ ...p('/alice/status/123') }, { handle: 'alice', id: '123' });
  assert.deepEqual({ ...p('/alice/status/123/photo/1') }, { handle: 'alice', id: '123' });
  assert.deepEqual({ ...p('/i/web/status/9') }, { handle: null, id: '9' });
  assert.deepEqual({ ...p('/i/status/9') }, { handle: null, id: '9' });
  assert.equal(p('/alice/status/12x'), null);
  assert.equal(p('/alice'), null);
  assert.equal(p('/home'), null);
  window.close();
});
