// The Karakeep REST API (/api/v1) as this extension uses it, and the save flow on top of it.
//
// `fetch` is injected so the tests run the whole flow against a fake server with no network.
// ⚠ The API key never appears in an error, a log line or a return value: errors name the status
// and Karakeep's own message, nothing from the request.
import {
  buildArchiveHtml,
  buildNote,
  buildTags,
  buildTitle,
  canonicalUrl,
  sanitizeCapture,
  statusIdOf,
  urlCandidates,
} from './format.js';

export class KarakeepError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'KarakeepError';
    this.status = status;
  }
}

const HINTS = {
  401: 'the API key was rejected — create a new one in Karakeep (Settings → API Keys) and paste it into the extension options',
  403: 'the API key lacks a scope — it needs bookmarks:readwrite and assets:readwrite (or full access)',
  413: 'the capture is larger than the server accepts (MAX_ASSET_SIZE_MB)',
  429: 'Karakeep is rate-limiting; try again in a minute',
};

// Origin as typed by the user → "https://host[:port]" or throws. http is allowed only for
// localhost, so a key is never sent in clear over a network.
export function normalizeOrigin(input) {
  let u;
  try {
    u = new URL(String(input).trim());
  } catch {
    throw new KarakeepError('not a URL — expected e.g. https://bookmarks.example.net');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new KarakeepError('the Karakeep address must be https:// (http only for localhost)');
  }
  if (u.username || u.password) throw new KarakeepError('the address must not contain credentials');
  return u.origin;
}

// The host-permission pattern for that origin: Chrome match patterns take no port.
export function originPattern(origin) {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}

export class Karakeep {
  constructor({ origin, apiKey, fetch: fetchImpl }) {
    this.origin = normalizeOrigin(origin);
    if (!apiKey) throw new KarakeepError('no API key configured — open the extension options');
    this._key = apiKey;
    this._fetch = fetchImpl;
  }

  async request(method, path, { json, form, query } = {}) {
    const url = new URL(`/api/v1${path}`, this.origin);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const headers = { Authorization: `Bearer ${this._key}`, Accept: 'application/json' };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form; // FormData: the runtime sets the multipart boundary
    }
    let res;
    try {
      res = await this._fetch(url.toString(), { method, headers, body, credentials: 'omit', redirect: 'error' });
    } catch (e) {
      throw new KarakeepError(`cannot reach ${this.origin} (${e && e.message ? e.message : 'network error'}) — on the home network or NetBird?`);
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const server = data && (data.message || data.error) ? String(data.message || data.error).slice(0, 200) : '';
      const hint = HINTS[res.status] || '';
      throw new KarakeepError(
        `Karakeep ${method} ${path} → ${res.status}${hint ? `: ${hint}` : ''}${server ? ` (server: ${server})` : ''}`,
        res.status,
      );
    }
    return { status: res.status, data };
  }

  async checkUrl(url) {
    const { data } = await this.request('GET', '/bookmarks/check-url', { query: { url } });
    return (data && data.bookmarkId) || null;
  }

  async getBookmark(id) {
    return (await this.request('GET', `/bookmarks/${encodeURIComponent(id)}`, { query: { includeContent: 'false' } })).data;
  }

  // Upload the archive and create the link bookmark with it — or, if a bookmark has exactly this
  // URL, replace its archive and recrawl it. One call; Karakeep's own SingleFile endpoint.
  async saveArchive(url, html, fileName) {
    const form = new FormData();
    form.append('url', url);
    form.append('file', new Blob([html], { type: 'text/html' }), fileName);
    const { status, data } = await this.request('POST', '/bookmarks/singlefile', {
      form,
      query: { ifexists: 'overwrite-recrawl' },
    });
    if (!data || !data.id) throw new KarakeepError('Karakeep accepted the upload but returned no bookmark id');
    return { bookmark: data, created: status === 201 };
  }

  async updateBookmark(id, fields) {
    return (await this.request('PATCH', `/bookmarks/${encodeURIComponent(id)}`, { json: fields })).data;
  }

  async attachTags(id, names) {
    return (
      await this.request('POST', `/bookmarks/${encodeURIComponent(id)}/tags`, {
        json: { tags: names.map((tagName) => ({ tagName, attachedBy: 'human' })) },
      })
    ).data;
  }
}

// The bookmark that already holds this post, under any URL form, or null. check-url matches one
// exact URL, so each form is asked; a hit is confirmed by reading the bookmark back and parsing
// its stored URL, whose exact spelling is what the upload must reuse to land on the same bookmark.
export async function findExisting(client, post) {
  for (const candidate of urlCandidates(post)) {
    const id = await client.checkUrl(candidate);
    if (!id) continue;
    const bm = await client.getBookmark(id);
    const url = bm && bm.content && bm.content.type === 'link' ? bm.content.url : null;
    if (url && statusIdOf(url) === post.id) return { id, url };
  }
  return null;
}

// The whole save. `inline` maps image fetchUrls to data: URIs (the background fetched them).
// Returns what the button shows; throws KarakeepError.
export async function saveCapture(client, rawCapture, { inline = {}, version }) {
  const capture = sanitizeCapture(rawCapture);
  const meta = { version };
  const existing = await findExisting(client, capture.focal);
  const url = existing ? existing.url : canonicalUrl(capture.focal);
  const html = buildArchiveHtml(capture, inline, meta);
  const { bookmark, created } = await client.saveArchive(url, html, `x-${capture.focal.id}.html`);
  if (existing && bookmark.id !== existing.id) {
    throw new KarakeepError(`Karakeep stored the archive on bookmark ${bookmark.id}, not on the existing ${existing.id}`);
  }
  await client.updateBookmark(bookmark.id, { title: buildTitle(capture), note: buildNote(capture, meta) });
  await client.attachTags(bookmark.id, buildTags(capture));
  return {
    id: bookmark.id,
    created,
    url,
    link: `${client.origin}/dashboard/preview/${encodeURIComponent(bookmark.id)}`,
    kind: capture.kind,
    posts: capture.thread ? capture.thread.length : 1,
    textComplete: (capture.thread || [capture.focal]).every((p) => p.textComplete),
    warnings: capture.warnings,
  };
}
