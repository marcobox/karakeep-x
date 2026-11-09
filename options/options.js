// Options: the Karakeep address and API key, and the one host permission they need.
//
// ⚠ The stored key is never shown back, not even masked: the field stays empty and says whether a
// key is set. Leaving it empty on save keeps the stored one.
import { Karakeep, KarakeepError, normalizeOrigin, originPattern } from '../src/karakeep.js';

const REQUIRED = new Set(chrome.runtime.getManifest().host_permissions);

const $ = (id) => document.getElementById(id);
const status = (text, kind) => {
  $('status').textContent = text;
  $('status').dataset.kind = kind || '';
};

async function load() {
  const { origin, apiKey } = await chrome.storage.local.get(['origin', 'apiKey']);
  $('origin').value = origin || '';
  $('keyState').textContent = apiKey ? 'A key is stored. Leave the field empty to keep it.' : 'No key stored yet.';
}

async function test() {
  const { origin, apiKey } = await chrome.storage.local.get(['origin', 'apiKey']);
  if (!origin || !apiKey) throw new KarakeepError('save an address and a key first');
  if (!(await chrome.permissions.contains({ origins: [originPattern(origin)] }))) {
    throw new KarakeepError(`no permission to reach ${origin} — press "Save & test" and allow it`);
  }
  const client = new Karakeep({ origin, apiKey, fetch: (...a) => fetch(...a) });
  // A read every scoped key with bookmarks access may make, and that writes nothing.
  await client.checkUrl('https://x.com/');
  return origin;
}

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  let origin;
  try {
    origin = normalizeOrigin($('origin').value);
  } catch (e) {
    status(e.message, 'error');
    return;
  }
  // The permission prompt must be the first await after the click, or Chrome drops the gesture.
  const pattern = originPattern(origin);
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: [pattern] });
  } catch (e) {
    status(`could not request access to ${origin}: ${e.message}`, 'error');
    return;
  }
  if (!granted) {
    status(`access to ${origin} was not granted; nothing saved`, 'error');
    return;
  }
  const prev = await chrome.storage.local.get(['origin', 'apiKey']);
  if (prev.origin && originPattern(prev.origin) !== pattern && !REQUIRED.has(originPattern(prev.origin))) {
    await chrome.permissions.remove({ origins: [originPattern(prev.origin)] });
  }
  const key = $('apiKey').value.trim();
  const next = { origin };
  if (key) next.apiKey = key;
  else if (!prev.apiKey) {
    status('paste an API key', 'error');
    return;
  }
  await chrome.storage.local.set(next);
  $('apiKey').value = '';
  await load();
  try {
    status(`connected to ${await test()} — the key works`, 'ok');
  } catch (e) {
    status(e.message, 'error');
  }
});

$('test').addEventListener('click', async () => {
  status('testing…');
  try {
    status(`connected to ${await test()} — the key works`, 'ok');
  } catch (e) {
    status(e.message, 'error');
  }
});

$('forget').addEventListener('click', async () => {
  const { origin } = await chrome.storage.local.get('origin');
  await chrome.storage.local.remove('apiKey');
  if (origin && !REQUIRED.has(originPattern(origin))) {
    await chrome.permissions.remove({ origins: [originPattern(origin)] });
  }
  await load();
  status('key forgotten and access to the address dropped. Revoke the key in Karakeep too (Settings → API Keys).', 'ok');
});

load();
