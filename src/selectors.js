// Every assumption this extension makes about X's markup, in one place.
//
// X changes its markup without notice. When a save starts failing, this is the file to fix: the
// button on the post names the selector that matched nothing (extract.js throws a SelectorError
// carrying the key below), and `npm test` runs every key against the fixtures in test/fixtures/.
// Update a fixture from a real page when you change a selector here, or the test proves nothing.
//
// Content-script world: a classic script, so it publishes on globalThis rather than exporting.
(function () {
  const SELECTORS = Object.freeze({
    // One post. Quoted posts are NOT articles: they are a role=link block inside one.
    post: 'article[data-testid="tweet"]',
    // Author block: display name, @handle and (outside the focal post) the time link. A second
    // match inside the same article belongs to the quoted post.
    userName: '[data-testid="User-Name"]',
    // The post body. Mentions, hashtags and links are <a>, emoji are <img alt>.
    text: '[data-testid="tweetText"]',
    // A long post truncated in a timeline. An <a> navigates to the post; a <button> expands inline.
    showMore: '[data-testid="tweet-text-show-more-link"]',
    // Time of posting; its closest <a> is the post's permalink.
    time: 'time[datetime]',
    // Media.
    photo: '[data-testid="tweetPhoto"] img',
    video: '[data-testid="videoPlayer"] video, [data-testid="videoComponent"] video',
    card: '[data-testid="card.wrapper"]',
    // "<someone> reposted" / "Pinned" above a post.
    socialContext: '[data-testid="socialContext"]',
    // The quoted post: the nearest of these around the second User-Name block.
    quoteContainer: 'div[role="link"]',
    // The reply/repost/like/bookmark bar, where the save button goes.
    actionBar: 'div[role="group"]',
    // The main timeline column; thread collection reads articles only from here.
    primaryColumn: '[data-testid="primaryColumn"]',
  });

  // Paths that are a post permalink: /<handle>/status/<id>[/…]. Handles are 1–15 of [A-Za-z0-9_];
  // `i` is X's handle-less form (/i/status/<id>, /i/web/status/<id>).
  // The `i` form is tried first: "i" alone is X's reserved path, not a handle.
  const STATUS_PATH = /^\/(?:i(?:\/web)?|([A-Za-z0-9_]{1,15}))\/status(?:es)?\/(\d{1,25})(?:[/?#]|$)/;

  // Path → {handle|null, id} for a post permalink, or null. Shared with the background (format.js).
  function parseStatusPath(path) {
    const m = STATUS_PATH.exec(path || '');
    return m ? { handle: m[1] || null, id: m[2] } : null;
  }

  const g = globalThis;
  g.KX = g.KX || {};
  g.KX.SELECTORS = SELECTORS;
  g.KX.STATUS_PATH = STATUS_PATH;
  g.KX.parseStatusPath = parseStatusPath;
})();
