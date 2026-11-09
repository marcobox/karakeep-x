// The save flow against an in-process fake of Karakeep's /api/v1 — no network.
//
// The scars this guards: a second save of the same post creating a duplicate bookmark (or, worse,
// landing the new archive on the wrong one); a post saved earlier under twitter.com not being
// found; and an API key echoed into an error message that the button then shows on x.com.
import './guard.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Karakeep, KarakeepError, findExisting, normalizeOrigin, originPattern, saveCapture } from '../src/karakeep.js';

const KEY = 'ak2_test_0123456789abcdef_not_a_real_key';

// A fake Karakeep: bookmarks by id, exact-URL dedupe on create, check-url as v0.34.1 does it
// (exact match ignoring fragment and trailing slash). Records every request.
function fakeKarakeep({ status401 = false, existing = [] } = {}) {
  const bookmarks = new Map();
  const calls = [];
  let n = 0;
  for (const url of existing) bookmarks.set(`bm${++n}`, { id: `bm${n}`, url, note: null, title: null, tags: [], archives: [] });
  const norm = (u) => {
    const x = new URL(u);
    x.hash = '';
    if (x.pathname.endsWith('/') && x.pathname !== '/') x.pathname = x.pathname.slice(0, -1);
    return x.toString();
  };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  async function fetch(url, init) {
    const u = new URL(url);
    const method = init.method;
    calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), auth: init.headers.Authorization });
    if (u.origin !== 'https://bookmarks.test') throw new TypeError('fake: unexpected host');
    if (status401 || init.headers.Authorization !== `Bearer ${KEY}`) return json(401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    const m = u.pathname.match(/^\/api\/v1\/bookmarks(?:\/([^/]+))?(?:\/(tags))?$/);
    if (u.pathname === '/api/v1/bookmarks/check-url') {
      const want = norm(u.searchParams.get('url'));
      const hit = [...bookmarks.values()].find((b) => norm(b.url) === want);
      return json(200, { bookmarkId: hit ? hit.id : null });
    }
    if (u.pathname === '/api/v1/bookmarks/singlefile' && method === 'POST') {
      const form = init.body;
      const url = form.get('url');
      const file = form.get('file');
      const html = await file.text();
      assert.equal(u.searchParams.get('ifexists'), 'overwrite-recrawl');
      assert.equal(file.type, 'text/html');
      const hit = [...bookmarks.values()].find((b) => b.url === url);
      if (hit) {
        hit.archives = [html];
        return json(200, { id: hit.id });
      }
      const id = `bm${++n}`;
      bookmarks.set(id, { id, url, note: null, title: null, tags: [], archives: [html] });
      return json(201, { id });
    }
    if (m && m[1] && !m[2] && method === 'GET') {
      const b = bookmarks.get(m[1]);
      return b ? json(200, { id: b.id, content: { type: 'link', url: b.url } }) : json(404, { message: 'not found' });
    }
    if (m && m[1] && !m[2] && method === 'PATCH') {
      const b = bookmarks.get(m[1]);
      Object.assign(b, JSON.parse(init.body));
      return json(200, { id: b.id });
    }
    if (m && m[2] === 'tags' && method === 'POST') {
      const b = bookmarks.get(m[1]);
      for (const t of JSON.parse(init.body).tags) if (!b.tags.includes(t.tagName)) b.tags.push(t.tagName);
      return json(200, { attached: [] });
    }
    return json(404, { message: `fake: no route ${method} ${u.pathname}` });
  }
  return { fetch, bookmarks, calls };
}

function capture(over = {}) {
  const focal = {
    id: '1001',
    url: 'https://x.com/alice/status/1001',
    author: { handle: 'alice', name: 'Alice' },
    postedAt: '2026-11-01T10:00:00.000Z',
    text: 'Hello',
    textComplete: true,
    lang: 'en',
    links: [],
    media: [],
    card: null,
    socialContext: null,
    quoted: null,
    ...over,
  };
  return { schema: 'karakeep-x/1', capturedAt: '2026-11-09T12:00:00.000Z', pageUrl: 'https://x.com/home', kind: 'post', focal, thread: null, threadAtEdge: false, warnings: [] };
}

test('self-test: a fake Karakeep defined in this file', () => {
  console.log('self-test: saveCapture/findExisting against fakeKarakeep() (karakeep.test.mjs), no network');
});

test('a first save creates one bookmark with archive, title, note and tags', async () => {
  const k = fakeKarakeep();
  const client = new Karakeep({ origin: 'https://bookmarks.test', apiKey: KEY, fetch: k.fetch });
  const r = await saveCapture(client, capture(), { version: '0.1.0' });
  assert.equal(r.created, true);
  assert.equal(r.url, 'https://x.com/alice/status/1001');
  assert.equal(r.link, 'https://bookmarks.test/dashboard/preview/bm1');
  assert.equal(k.bookmarks.size, 1);
  const b = k.bookmarks.get('bm1');
  assert.match(b.title, /^Alice \(@alice\) on X/);
  assert.match(b.note, /"schema": "karakeep-x\/1"/);
  assert.deepEqual(b.tags, ['x:alice', 'source:karakeep-x']);
  assert.match(b.archives[0], /<p>Hello<\/p>/);
  assert.ok(k.calls.every((c) => c.auth === `Bearer ${KEY}`));
});

test('saving again updates the same bookmark: no duplicate, new archive', async () => {
  const k = fakeKarakeep();
  const client = new Karakeep({ origin: 'https://bookmarks.test', apiKey: KEY, fetch: k.fetch });
  await saveCapture(client, capture({ text: 'first', textComplete: false }), { version: '0.1.0' });
  const r = await saveCapture(client, capture({ text: 'first, now in full' }), { version: '0.1.0' });
  assert.equal(r.created, false);
  assert.equal(k.bookmarks.size, 1);
  const b = k.bookmarks.get('bm1');
  assert.match(b.archives[0], /first, now in full/);
  assert.match(b.note, /"textComplete": true/);
});

test('a post bookmarked earlier as twitter.com is found and updated, not duplicated', async () => {
  const k = fakeKarakeep({ existing: ['https://twitter.com/alice/status/1001/'] });
  const client = new Karakeep({ origin: 'https://bookmarks.test', apiKey: KEY, fetch: k.fetch });
  const found = await findExisting(client, capture().focal);
  assert.deepEqual(found, { id: 'bm1', url: 'https://twitter.com/alice/status/1001/' });
  const r = await saveCapture(client, capture(), { version: '0.1.0' });
  assert.equal(r.created, false);
  assert.equal(r.url, 'https://twitter.com/alice/status/1001/', 'the upload reuses the stored spelling');
  assert.equal(k.bookmarks.size, 1);
});

test('a different post never matches (id 10011 is not 1001)', async () => {
  const k = fakeKarakeep({ existing: ['https://x.com/alice/status/10011'] });
  const client = new Karakeep({ origin: 'https://bookmarks.test', apiKey: KEY, fetch: k.fetch });
  const r = await saveCapture(client, capture(), { version: '0.1.0' });
  assert.equal(r.created, true);
  assert.equal(k.bookmarks.size, 2);
});

test('a rejected key gives a fix, and the key is in no error', async () => {
  const k = fakeKarakeep({ status401: true });
  const client = new Karakeep({ origin: 'https://bookmarks.test', apiKey: KEY, fetch: k.fetch });
  await assert.rejects(saveCapture(client, capture(), { version: '0.1.0' }), (e) => {
    assert.ok(e instanceof KarakeepError);
    assert.equal(e.status, 401);
    assert.match(e.message, /Settings → API Keys/);
    assert.ok(!e.message.includes(KEY) && !e.message.includes(KEY.slice(4, 20)), 'key leaked into the message');
    return true;
  });
});

test('an unreachable server says so without the key', async () => {
  const client = new Karakeep({
    origin: 'https://bookmarks.test',
    apiKey: KEY,
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(client.checkUrl('https://x.com/'), (e) => /cannot reach https:\/\/bookmarks.test/.test(e.message) && !e.message.includes(KEY));
});

test('origins: https only (http for localhost), no credentials, permission pattern without port', () => {
  assert.equal(normalizeOrigin(' https://bookmarks.example.net/some/path '), 'https://bookmarks.example.net');
  assert.equal(normalizeOrigin('http://localhost:3000'), 'http://localhost:3000');
  assert.throws(() => normalizeOrigin('http://bookmarks.example.net'), /https/);
  assert.throws(() => normalizeOrigin('https://u:p@bookmarks.example.net'), /credentials/);
  assert.throws(() => normalizeOrigin('bookmarks'), /not a URL/);
  assert.equal(originPattern('https://bookmarks.example.net:8443'), 'https://bookmarks.example.net/*');
  assert.throws(() => new Karakeep({ origin: 'https://a.example', apiKey: '' }), /no API key/);
});
