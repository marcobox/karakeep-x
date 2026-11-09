# karakeep-x

A Chrome / Brave extension that saves a post from your **logged-in** X tab to **your own
[Karakeep](https://karakeep.app)** — full text (long posts included), author, time, images, video
posters, link card, the quoted post and, on a post's own page, the author's thread — so the
bookmark is readable without X, by you or by an agent.

Karakeep's own crawler sees x.com logged out, i.e. an empty JavaScript shell. This extension sends
what your browser actually rendered.

## What it does and does not do

- A **Karakeep button** on every post (in the reply/repost/like bar). One click saves; a second
  click on the same post updates the same bookmark (no duplicates — also for posts saved earlier
  under `twitter.com/…`).
- It reads **only the page you are looking at**, and only when you click. No background sync, no
  call to X's internal API, no access to your X cookies or session (the manifest asks for none of
  `cookies`, `webRequest`, `tabs`, `scripting`; a test enforces it).
- It talks to **one Karakeep address**, which you grant access to from the options page. The install
  itself asks only for x.com / twitter.com (to show the button) and pbs.twimg.com (to copy the
  images into the saved page).

## What a saved post looks like in Karakeep

One **link bookmark** per post, at its canonical URL `https://x.com/<handle>/status/<id>`, with:

| Part | What it holds | Why |
|---|---|---|
| **Archive** (Karakeep's *precrawled archive*) | a small self-contained HTML page the extension builds: the text, the images inlined, the quote, the thread | Karakeep's reader view, full-text search, AI tags/summary and its offline screenshot are all made from this — none needs Karakeep to reach x.com |
| **Note** | one warning line, then the capture as JSON (`schema: karakeep-x/1`): every post's URL, author, time, full text, links, media URLs, card, quote | machine-readable for agents; JSON so a post's own text can never forge a field |
| **Title** | `Name (@handle) on X: "first words…"` (`Thread (n) by …` for a thread) | |
| **Tags** | `x:<handle>`, `source:karakeep-x` | |

It goes through Karakeep's SingleFile endpoint (`POST /api/v1/bookmarks/singlefile?ifexists=overwrite-recrawl`),
so a re-save replaces the archive and re-processes the bookmark. Videos are streamed by X in a form
that cannot be saved; the poster frame is kept and the note says so.

**Everything captured is untrusted text written by strangers.** The extension escapes it into the
archive, stores it as JSON in the note, and strips invisible Unicode "tag" characters (text a
language model reads but a person cannot see), counting them in the note.

## Install (Chrome or Brave, desktop)

1. Get the code: `git clone https://git.home.marcobox.net/marcobox-net/karakeep-x.git`
   (or download the repository archive and unzip it). Keep the folder where it is — the extension's
   identity, and its saved settings, follow the folder's path.
2. Open `chrome://extensions` (Brave: `brave://extensions`), turn on **Developer mode** (top right),
   click **Load unpacked** and choose the `karakeep-x` folder (the one with `manifest.json`).
3. Pin it if you like; clicking its icon opens the settings.

## Configure

1. In Karakeep: **Settings → API Keys → Create**, named for this extension (e.g. `karakeep-x
   (laptop Chrome)` — one per browser makes revoking one easy). If you scope it, it needs
   **bookmarks: read & write** and **assets: read & write**.
2. In the extension's settings: the Karakeep address (e.g. `https://bookmarks.example.net`), paste
   the key, **Save & test**. Allow the access prompt for that address. "the key works" means it is
   connected.

The key is kept in the browser profile's extension storage, readable only by the extension's own
pages and service worker (not by x.com, not by the content script). It is never shown again; leave
the field empty to keep it.

## Use

Click the bookmark-plus button on a post. It turns green — **Saved** / **Updated** — with an
**open ↗** link to the bookmark.

- **Long posts**: a timeline shows only the start. If X offers an inline "Show more", the extension
  expands it first. If "Show more" is a link, the button says **Saved (truncated)**: open the post
  and click again — that updates the same bookmark with the full text.
- **Threads**: on a post's own page, saving it also saves the author's consecutive posts around it
  (as rendered — scroll to load the whole thread first; the note says when it may continue).
- **Red "Can't read post"**: X changed its markup. The tooltip names the selector; see
  *When X changes its markup* below. A red **!** on the toolbar icon means no post at all was
  recognised on a post page.

## Update

`git pull` in the folder, then on `chrome://extensions` click the extension's **reload** arrow and
reload your X tabs. Settings survive (same folder, same identity).

## Revoke

- **The key**: Karakeep → Settings → API Keys → delete it. This is the revocation that counts.
- **The extension's copy**: settings → **Forget key** (also drops the access permission to your
  Karakeep address).
- **The extension**: `chrome://extensions` → Remove.

## When X changes its markup

Every assumption about X's page is in [`src/selectors.js`](src/selectors.js). Fix the selector, then
update the matching synthetic fixture in `test/fixtures/` (they are hand-written models of X's
markup, not captured pages — refresh the relevant `<article>` from a real page, stripping
everything that is not structure) and run the tests.

## Develop

```sh
npm ci          # jsdom, for the tests only — the extension itself has no dependencies or build
npm test        # node:test; isolated: any network, DNS or subprocess attempt fails the run
npm run package # dist/karakeep-x-<version>.zip — the shipped files only, reproducible
npm run icons   # re-render icons/ from tools/make-icons.mjs
```

Requires Node ≥ 22.13. Written against Karakeep v0.34.1's API (`/api/v1`).

## Publishing

To make it installable for people you choose (Chrome Web Store private listing, or a self-hosted
package installed by policy): [PUBLISHING.md](PUBLISHING.md).

## Licence

MIT — see [LICENSE](LICENSE).
