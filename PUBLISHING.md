# Publishing karakeep-x — so only the people you choose can install it

Three ways to get it into a browser, from least to most machinery. Every Google rule below was read
from Google's own pages on 2026-11-09 (links inline); re-check them before acting, because they
change.

| | Who can install | Updates | Cost / effort | Works on |
|---|---|---|---|---|
| **A. Load unpacked from git** (today) | anyone you give repo access to | `git pull` + reload, by hand | none | any desktop OS |
| **B. Chrome Web Store, Private** | Google accounts you list (trusted testers) or a Google Group you own | automatic, after Google re-reviews each version | one-time developer fee, 2-Step Verification, a listing, review per version | any desktop OS, Chrome and Brave |
| **C. Self-hosted CRX + browser policy** | machines where you (root) write a policy file | automatic, from your own server | a signing key, an update server, root on each machine | **Linux only** for Chrome |

**Recommendation:** stay on **A** while it is mostly you on your own Linux machines. Move to **B
(Private)** when someone else needs it, or you want automatic updates without running a server.
**C** fits only Linux machines you administer, and adds a second signing key to look after.

## A. Load unpacked from git

This is what the README describes. Access is controlled by who can read
`marcobox-net/karakeep-x` on Forgejo (the repo is private). Nothing to publish.

## B. Chrome Web Store, Private visibility

What Google requires ([register](https://developer.chrome.com/docs/webstore/register),
[set up](https://developer.chrome.com/docs/webstore/set-up-account),
[2SV](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification),
[distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution),
[listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing),
[privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
[review](https://developer.chrome.com/docs/webstore/review-process),
[update](https://developer.chrome.com/docs/webstore/update)):

- **Developer account**: a Google account, a one-time registration fee (the amount is shown at
  sign-up; the docs page does not state it), **2-Step Verification on that account** (required
  before publishing *or updating*), a publisher name and a verified contact email. The account email
  can never be changed, so Google suggests a dedicated address. A new publisher may have at most
  two published extensions.
- **Visibility** (Distribution tab), with the same policy and the same review for all three:
  - *Public*: listed and searchable.
  - *Unlisted*: not listed, but **anyone with the URL** can install. Not "only people I choose".
  - **Private**: only **trusted testers** (individual Google accounts listed on the *account* page;
    the list is per account, not per item), plus any **Google Groups you own or manage**, added per
    item. Members of those groups can install. ← this one.
- **Listing**: a 128×128 store icon (`icons/icon128.png`), **at least one 1280×800 screenshot**, a
  description, a category, a language.
- **Privacy tab**: a single-purpose statement, a **justification for each permission**, the
  remote-code declaration ("No": everything is in the package), the data-use disclosures, and a
  **privacy policy URL**. Drafts:
  - *Single purpose*: "Save a post the user is viewing on X to the user's own self-hosted Karakeep
    server, on a click."
  - *storage*: "Stores the user's Karakeep address and API key."
  - *x.com, twitter.com*: "Adds the save button to posts and reads the post the user clicks."
  - *pbs.twimg.com*: "Copies the clicked post's images into the saved page."
  - *Optional host permission*: "Requests access to the one Karakeep server address the user
    enters, at the moment they enter it."
  - *Data*: the extension sends the clicked post's content to the user's own server and nowhere
    else; the developer receives nothing. The privacy policy has to say that, at a public URL.
    The Forgejo repo is private and internal, so the policy needs a public page somewhere
    (any static page you control).
- **Review**: usually a few days, sometimes weeks, and **every update is reviewed again**. Broad
  host patterns make review longer — `optional_host_permissions` here includes `https://*/*` so a
  user can type any Karakeep address. For a store build used only with your server, narrow it to
  that one origin first (this also removes the broad pattern from the review).
- **Upload**: `npm run package` → `dist/karakeep-x-<version>.zip` → Developer Dashboard → *Add new
  item*. Updates: bump the version, upload the new zip on the Package tab, submit. The store
  signs the package; you hold no signing key.
- **Brave** installs from the Chrome Web Store as well (it is Chromium).

## C. Self-hosted CRX, installed by policy

From [self-host for Linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)
and the [ExtensionInstallForcelist policy](https://chromeenterprise.google/policies/extension-install-forcelist/):

- **Linux is the only platform** where Chrome installs extensions hosted outside the store (on
  Windows/macOS only domain-joined or MDM-managed machines can). The extension is **force-installed**:
  the user cannot disable or remove it.
- **A signing key**: `chrome --pack-extension=<dir>` creates `karakeep-x.crx` and a private key
  `.pem` the first time; every update must be signed with the **same** key (lose it and installed
  copies can never update). It is a new secret: store it in OpenBao
  (`estate bao put <mount/path> KEY`, entered interactively), **never in git** (`.gitignore` already
  refuses `*.pem` and `*.crx`). Pack on `development`, reading the key from OpenBao into the pack
  command, not onto disk longer than the pack takes.
- **The manifest** gains `"update_url": "https://<host>/karakeep-x/updates.xml"` (and, to keep the
  ID stable between unpacked and packed builds, the public `"key"`).
- **The update server** serves `updates.xml` (`<gupdate>` → `<app appid=ID>` → `<updatecheck
  codebase=https://…/karakeep-x-<v>.crx version=<v>/>`) and the `.crx` as
  `application/x-chrome-extension`, **without** `X-Content-Type-Options: nosniff`. Browsers check
  every few hours, without cookies. An internal host works while the laptop is at home or on
  NetBird; away from both, the installed version keeps working and updates wait.
- **The policy**: a JSON file, owned by root and not user-writable:
  - Chrome: `/etc/opt/chrome/policies/managed/karakeep-x.json`
  - Brave: `/etc/brave/policies/managed/karakeep-x.json`

  ```json
  { "ExtensionInstallForcelist": ["<extension-id>;https://<host>/karakeep-x/updates.xml"] }
  ```

  The policy's update URL is used for the **first install only**; after that, the manifest's
  `update_url` is used. Check it at `chrome://policy` (Brave: `brave://policy`) → *Reload policies*.
- Writing `/etc` on a machine is a change to that machine: it belongs in the machine's config
  management, not done by hand.
