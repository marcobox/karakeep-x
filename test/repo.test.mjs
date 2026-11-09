// Repository invariants: what the extension may ask the browser for, and that every test file is
// isolated.
//
// The scar behind the permission check: the third-party "X to Karakeep" extension this replaces
// held `cookies` + `webRequest` and polled X's internal API with the user's session — a future
// update of it could read the session. This extension must never grow those, nor all-sites access.
import './guard.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { manifest, read } from './helpers.mjs';

const root = new URL('../', import.meta.url);

test('permissions: storage only; hosts: X and its image CDN; nothing broad', () => {
  console.log(`corpus: manifest.json v${manifest.version}`);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://x.com/*', 'https://twitter.com/*', 'https://pbs.twimg.com/*']);
  const all = JSON.stringify(manifest);
  for (const banned of ['cookies', 'webRequest', 'declarativeNetRequest', '<all_urls>', 'tabs', 'scripting', 'alarms', 'history']) {
    assert.ok(!all.includes(`"${banned}`), `manifest asks for ${banned}`);
  }
  // The Karakeep origin is requested at runtime, for that one origin, from the options page.
  assert.ok(Array.isArray(manifest.optional_host_permissions));
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://x.com/*', 'https://twitter.com/*']);
});

test('every file the manifest names exists; versions agree', () => {
  const files = [
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((c) => [...c.js, ...(c.css || [])]),
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
  ];
  console.log(`corpus: ${files.length} file(s) named by manifest.json`);
  for (const f of files) assert.ok(existsSync(new URL(f, root)), `missing ${f}`);
  assert.equal(JSON.parse(read('package.json')).version, manifest.version, 'package.json and manifest.json versions differ');
});

test('no X internal API and no cookie/session access anywhere in the shipped code', () => {
  const shipped = ['src', 'options'].flatMap((d) => readdirSync(new URL(`${d}/`, root)).map((f) => `${d}/${f}`)).filter((f) => /\.(js|html)$/.test(f));
  console.log(`corpus: ${shipped.length} shipped file(s)`);
  assert.ok(shipped.length >= 7);
  for (const f of shipped) {
    const s = read(f);
    for (const bad of [/\/i\/api\//, /graphql/i, /document\.cookie/, /chrome\.cookies/, /ct0/, /x-csrf-token/i, /\.innerHTML\s*=/, /insertAdjacentHTML/]) {
      assert.ok(!bad.test(s), `${f} matches ${bad}`);
    }
  }
});

test('every test file imports the isolation guard first', () => {
  const tests = readdirSync(new URL('test/', root)).filter((f) => f.endsWith('.test.mjs'));
  console.log(`corpus: ${tests.length} test file(s)`);
  assert.ok(tests.length >= 5);
  for (const f of tests) {
    const firstImport = read(`test/${f}`).split('\n').find((l) => l.startsWith('import '));
    assert.equal(firstImport, "import './guard.mjs';", `${f} must start its imports with the guard`);
  }
});
