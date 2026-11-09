# AGENTS.md — karakeep-x

A Manifest V3 browser extension (plain JS, no build step) that saves a post from the user's
logged-in X tab to their Karakeep. Standalone repo in the `marcobox-net` Forgejo org — **not** an
estate repo (not in `repos.yaml`); a push is not a deploy (users load it unpacked or from a package
the owner publishes). Human docs: `README.md`.

## Rules

- **Never add `cookies`, `webRequest`, `tabs`, `scripting`, `<all_urls>`, or any call to X's
  internal API (`/i/api/`, GraphQL).** The extension reads only the rendered DOM of the tab, on a
  click. `test/repo.test.mjs` enforces it; do not weaken that test to land a feature.
- **Every assumption about X's markup lives in `src/selectors.js`.** A selector change comes with a
  fixture change in `test/fixtures/`, or the test proves nothing. A selector that matches nothing must
  throw a `SelectorError` naming its key — never save less silently.
- **Captured text is untrusted and is read by AI agents later.** It is sanitised once
  (`format.js: sanitizeCapture`), then only ever JSON-encoded (note) or HTML-escaped (archive).
  Never `innerHTML` in the content script.
- **No API key in the repo, a fixture, a test or a transcript.** Tests use a fake Karakeep
  (`test/karakeep.test.mjs`). A live test is by hand, with a key the owner creates and pastes into
  the options page themselves.
- **Every test file's first import is `./guard.mjs`** (enforced). It denies network, DNS, sockets
  and subprocesses and fails the run on any attempt, even one the code under test swallowed.

## Layout

```
manifest.json          permissions: storage; hosts: x.com, twitter.com, pbs.twimg.com; the
                       Karakeep origin is an optional permission requested at runtime
src/selectors.js       X markup assumptions + the status-path parser (shared with the worker)
src/extract.js         DOM → capture (content script; pure reading)
src/content.js         the button, the click, the broken-markup badge report
src/background.js      service worker: holds the key, inlines images, calls karakeep.js
src/format.js          capture → title, note (JSON), tags, archive HTML; sanitising
src/karakeep.js        /api/v1 client + the save flow (dedupe → singlefile upload → note → tags)
options/               address + key, permission request, test, forget
test/                  node:test + jsdom; fixtures are SYNTHETIC models of X's markup
tools/                 make-icons.mjs, package.mjs (reproducible store zip)
```

## Commands

```sh
npm ci && npm test      # must print `corpus:` / `self-test:` lines; read the counts
npm run package         # dist/karakeep-x-<version>.zip
```

## Releasing

Bump `version` in **both** `manifest.json` and `package.json` (a test refuses a mismatch), `npm
test`, commit, push. Unpacked users `git pull` and reload. A Chrome Web Store upload is the
owner's action, with `dist/karakeep-x-<version>.zip`.
