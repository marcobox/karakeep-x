# Privacy policy — Post Keeper for Karakeep

*Effective 2026-11-10. Applies to the browser extension "Post Keeper for Karakeep" (source:
<https://github.com/marcobox/karakeep-x>). Unofficial: not made by, affiliated with or endorsed by
X Corp. or the Karakeep project.*

**In one sentence:** the extension sends the X post you click "save" on to the Karakeep server
*you* configure, and to nobody else — its developer receives nothing.

## What the extension handles, and where it goes

| Data | When | Where it goes |
|---|---|---|
| **The content of a post you choose to save** — its text, author name and handle, time, links, image and video-poster addresses, a quoted post, and, on a post's own page, the author's adjacent posts in the thread | only when you click the extension's button on that post | to **your own Karakeep server**, at the address you entered in the extension's settings |
| **Images of that post** | at the same click | downloaded from X's image server (`pbs.twimg.com`) and included in what is sent to your Karakeep server |
| **Your Karakeep address and API key** | when you enter them in the settings | stored in your browser profile's extension storage; the key is sent only to that address, to authenticate the save |

The extension does **not**:

- read anything on X until you click its button, nor anything outside the post you clicked;
- read your X cookies, session or account, or call X's internal API;
- run in the background, sync, or save anything automatically;
- collect analytics, telemetry, crash reports or usage data;
- send any data to its developer or to any third party. There is no developer server.

## Your control

- What is saved lives on **your** Karakeep server, under your account and that server's own policy;
  delete it there.
- **Settings → Forget key** removes the API key from the browser and drops the extension's access to
  your server's address. Revoke the key itself in Karakeep (Settings → API Keys).
- Removing the extension deletes its stored settings.

## Limited use

Data is used only to provide the extension's single purpose — saving the post you chose to your
own Karakeep. It is not sold, not transferred to third parties, not used for advertising or
creditworthiness, and not used for any purpose unrelated to that single purpose.

## Changes and contact

Changes to this policy are published in this file, with its history in the repository.
Questions: open an issue at <https://github.com/marcobox/karakeep-x/issues>.
