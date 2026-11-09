// The service worker: the only context that holds the API key and talks to Karakeep.
//
// The content script (on x.com) sends a capture; this worker inlines the images, saves through
// karakeep.js and answers with what the button should say. The content script never sees the key:
// storage.local is restricted to trusted contexts below, so the x.com page's world — and the
// content script running beside it — cannot read it.
import { Karakeep, KarakeepError, normalizeOrigin, originPattern, saveCapture } from './karakeep.js';

const VERSION = chrome.runtime.getManifest().version;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_INLINE_BYTES = 40 * 1024 * 1024; // well under the server's MAX_ASSET_SIZE_MB (100)
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function restrictStorage() {
  try {
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    /* older Chrome: content scripts could read it; the key is still never sent to one */
  }
}
chrome.runtime.onInstalled.addListener(restrictStorage);
chrome.runtime.onStartup.addListener(restrictStorage);
restrictStorage();

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// fetchUrl → data: URI for every image and video poster, from pbs.twimg.com only (the one image
// host this extension holds a permission for). A failed image stays a remote URL in the archive.
async function inlineImages(capture) {
  const posts = capture.thread || [capture.focal];
  const urls = new Set();
  for (const p of posts) {
    for (const m of [...p.media, ...((p.quoted && p.quoted.media) || [])]) {
      if (m.fetchUrl && m.fetchUrl.startsWith('https://pbs.twimg.com/')) urls.add(m.fetchUrl);
    }
  }
  const inline = {};
  let total = 0;
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (!res.ok || !IMAGE_TYPES.has(type)) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_IMAGE_BYTES || total + buf.byteLength > MAX_INLINE_BYTES) continue;
      total += buf.byteLength;
      inline[url] = `data:${type};base64,${toBase64(buf)}`;
    } catch {
      /* keep the remote URL */
    }
  }
  return inline;
}

async function settings() {
  const { origin, apiKey } = await chrome.storage.local.get(['origin', 'apiKey']);
  if (!origin || !apiKey) throw new KarakeepError('not configured — open the extension options (click its toolbar icon)');
  const o = normalizeOrigin(origin);
  if (!(await chrome.permissions.contains({ origins: [originPattern(o)] }))) {
    throw new KarakeepError(`no permission to reach ${o} — open the extension options and save again`);
  }
  return { origin: o, apiKey };
}

async function handleSave(capture) {
  const s = await settings();
  const client = new Karakeep({ ...s, fetch: (...a) => fetch(...a) });
  const inline = await inlineImages(capture);
  return saveCapture(client, capture, { inline, version: VERSION });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg && msg.type === 'save') {
    handleSave(msg.capture).then(
      (result) => reply({ ok: true, result }),
      (e) => reply({ ok: false, error: e instanceof KarakeepError ? e.message : `unexpected error: ${e && e.message}` }),
    );
    return true; // async reply
  }
  if (msg && msg.type === 'markup' && sender.tab) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.broken ? '!' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#c62828' });
    chrome.action.setTitle({
      tabId: sender.tab.id,
      title: msg.broken ? `karakeep-x: ${String(msg.detail).slice(0, 300)}` : 'karakeep-x — settings',
    });
  }
  return false;
});
