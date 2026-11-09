// content.js in a fixture page, with `chrome` stubbed: where the button goes, what a click sends,
// and that broken markup is reported rather than swallowed.
import './guard.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDom, manifest } from './helpers.mjs';

// Closing the page mutates the DOM; content.js's observer would then schedule a scan of a dead
// window. Scans run only via requestAnimationFrame, so stop it first.
function close(window) {
  window.requestAnimationFrame = () => 0;
  window.close();
}

function stubChrome(window, answer) {
  const sent = [];
  window.chrome = {
    runtime: {
      sendMessage: async (msg) => {
        sent.push(JSON.parse(JSON.stringify(msg)));
        return msg.type === 'save' ? answer(msg) : undefined;
      },
    },
  };
  return sent;
}

function load(fixture, url, answer = () => ({ ok: true, result: { id: 'bm1', created: true, link: 'https://bookmarks.test/dashboard/preview/bm1', kind: 'post', posts: 1, textComplete: true } })) {
  let sent;
  const env = loadDom(fixture, url, {
    scripts: manifest.content_scripts[0].js,
    beforeScripts: (w) => {
      sent = stubChrome(w, answer);
    },
  });
  return { ...env, sent };
}
const frame = (w) => new Promise((r) => w.requestAnimationFrame(() => r()));
const settle = (w, ms = 30) => new Promise((r) => w.setTimeout(r, ms));

test('one button per post, in the post\'s own action bar — never the quote\'s', async () => {
  const { window, document, KX } = load('timeline.html', 'https://x.com/home');
  await frame(window);
  const posts = document.querySelectorAll(KX.SELECTORS.post);
  const buttons = document.querySelectorAll('.kx-btn');
  console.log(`corpus: timeline.html, ${posts.length} posts, ${buttons.length} buttons`);
  assert.equal(buttons.length, posts.length);
  const quote = KX.findQuote(posts[1]);
  assert.ok(!quote.querySelector('.kx-btn'), 'button injected into the quoted post');
  for (const p of posts) assert.ok(p.querySelector(`${KX.SELECTORS.actionBar} .kx-btn`), 'button outside the action bar');
  await frame(window);
  assert.equal(document.querySelectorAll('.kx-btn').length, posts.length, 'a rescan must not inject twice');
  close(window);
});

test('a click sends the capture and shows the result with a link', async () => {
  const { window, document, sent } = load('timeline.html', 'https://x.com/home');
  await frame(window);
  const btn = document.querySelectorAll('.kx-btn')[0];
  btn.click();
  await settle(window);
  const saves = sent.filter((m) => m.type === 'save');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].capture.focal.id, '1001');
  assert.equal(btn.dataset.state, 'done');
  assert.equal(btn.textContent, 'Saved');
  const open = btn.parentElement.querySelector('.kx-open');
  assert.equal(open.hidden, false);
  assert.equal(open.href, 'https://bookmarks.test/dashboard/preview/bm1');
  close(window);
});

test('an error from the worker is shown on the button, as text', async () => {
  const { window, document } = load('timeline.html', 'https://x.com/home', () => ({ ok: false, error: '<b>401</b> key rejected' }));
  await frame(window);
  const btn = document.querySelectorAll('.kx-btn')[0];
  btn.click();
  await settle(window);
  assert.equal(btn.dataset.state, 'error');
  assert.equal(btn.title, 'Karakeep: <b>401</b> key rejected');
  assert.equal(btn.querySelector('b'), null, 'error rendered as markup');
  close(window);
});

test('unreadable markup: the button names the selector, nothing is sent, the badge is set', async () => {
  const { window, document, sent } = load('broken.html', 'https://x.com/home');
  await frame(window);
  const btn = document.querySelector('#no-body .kx-btn');
  btn.click();
  await settle(window);
  assert.equal(btn.dataset.state, 'error');
  assert.match(btn.title, /selector "text"/);
  assert.equal(sent.filter((m) => m.type === 'save').length, 0, 'an unreadable post was sent for saving');
  assert.ok(sent.some((m) => m.type === 'markup' && m.broken), 'no markup report for the badge');
  close(window);
});
