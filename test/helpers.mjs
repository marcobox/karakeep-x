// Load a fixture into jsdom and run the content-script files in it, as Chrome would.
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
export const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
export const manifest = JSON.parse(read('manifest.json'));

export function fixtureNames() {
  return readdirSync(new URL('test/fixtures/', root)).filter((f) => f.endsWith('.html'));
}

// `scripts` defaults to the content scripts the manifest declares, minus content.js (which the
// content test adds itself, after stubbing `chrome`).
export function loadDom(fixture, url, { scripts, beforeScripts } = {}) {
  const html = read(`test/fixtures/${fixture}`);
  // No `resources: 'usable'`: jsdom fetches nothing (the guard would refuse it anyway).
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  if (beforeScripts) beforeScripts(dom.window);
  const files = scripts || manifest.content_scripts[0].js.filter((f) => !f.endsWith('content.js'));
  for (const f of files) dom.window.eval(read(f));
  return { dom, window: dom.window, document: dom.window.document, KX: dom.window.KX };
}
