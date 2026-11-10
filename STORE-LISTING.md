# Chrome Web Store listing — paste-ready

Everything the Developer Dashboard asks for, in the order of its tabs. The package is
`dist/karakeep-x-<version>.zip` from `npm run package`. Why each choice: PUBLISHING.md.

## Package

Upload `dist/karakeep-x-<version>.zip` (Add new item → Choose file).

## Store listing

**Name** (from the manifest): Post Keeper for Karakeep

**Summary** (from the manifest): Unofficial. Save a post from your logged-in X tab to your own
Karakeep: full text, author, media, quoted post, thread.

**Category**: Productivity → Tools · **Language**: English

**Description**:

```
Unofficial — not made by, affiliated with or endorsed by X Corp. or the Karakeep project.

Post Keeper adds a button to every post on X. One click saves the post you are looking at to your
own self-hosted Karakeep (https://karakeep.app) — as your browser shows it while you are logged in:

• the full text, including long posts
• author, handle and time
• images (copied into the saved page) and video poster frames
• the link card and the quoted post
• on a post's own page, the author's whole thread around it

Karakeep's own crawler sees X logged out, which is an empty page. Post Keeper sends what you see,
so the bookmark is readable, searchable and summarisable without X.

Saving the same post again updates the same bookmark — no duplicates. Each bookmark is tagged with
the author's handle.

Private by design: it reads only the post you click, only when you click. No background sync, no
access to your X cookies or account, no analytics. Your data goes to your Karakeep server and
nowhere else; the developer receives nothing.

Setup: in Karakeep, create an API key (Settings → API Keys); in the extension's settings, enter
your Karakeep address and the key. Source code: https://github.com/marcobox/karakeep-x
```

**Graphic assets**: store icon = `icons/icon128.png`; screenshots, 1280×800, at least one (up to 5):

1. A post on X with the button showing **Saved** and **open ↗**.
2. The resulting bookmark open in Karakeep (reader view or the note).
3. The extension's settings page (address filled in, key field empty).

Screenshots must show nothing private: use public posts, and crop out your other tabs, bookmarks
bar and account names you do not want shown.

**Homepage URL**: https://github.com/marcobox/karakeep-x
**Support URL**: https://github.com/marcobox/karakeep-x/issues

## Privacy practices

**Single purpose**:
> Save a post the user is viewing on X to the user's own self-hosted Karakeep server, when the user
> clicks the extension's button on that post.

**Permission justifications**:

| Permission | Justification |
|---|---|
| `storage` | Stores the user's Karakeep server address and API key, entered in the extension's settings. |
| Host `https://x.com/*`, `https://twitter.com/*` | Shows the save button on posts and reads the one post the user clicks to save. |
| Host `https://pbs.twimg.com/*` | Downloads the images of the post being saved, so the saved copy keeps them when X is unavailable. |
| Optional host `https://*/*` (and `http://localhost/*`, `http://127.0.0.1/*`) | Each user runs their own Karakeep server at their own address. The extension requests access to exactly that one address, at runtime, when the user enters it in the settings — never to any other site. Local addresses are for a server on the user's own machine. |

**Remote code**: No, I am not using remote code. (All code is in the package; nothing is fetched and
executed.)

**Data usage** — collected (sent off the device, to the user's own server only):

- **Website content** — the text, images and metadata of the post the user chooses to save.
- **Authentication information** — the user's own Karakeep API key, sent only to the user's own
  Karakeep server to authorise the save.

Nothing else (no personally identifiable information, communications, location, web history or user
activity). Tick all three certifications: not sold to third parties; not used or transferred for
purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or
for lending.

**Privacy policy URL**: https://github.com/marcobox/karakeep-x/blob/main/PRIVACY.md

## Distribution

**Visibility: Private** → trusted testers (the Google accounts listed on the account page) and/or a
Google Group you own. **Regions**: all. **Payments**: free, no in-app purchases.

## Test instructions (for the reviewer)

```
The extension needs a Karakeep server (open source, self-hosted: https://docs.karakeep.app).
It runs in one command: https://docs.karakeep.app/installation/docker (then Settings → API Keys).
Without one: on x.com (an X login is needed to see posts), the save button appears on each post;
clicking it before setup turns it red, and its tooltip reads "not configured — open the extension
options". A full save needs a Karakeep instance and an API key from it.
```
