// Putting the document skeleton back on a published fragment.
//
// `motu lagoon publish` deliberately strips <!doctype>/<html>/<head>/<body>, because the Artifact
// host supplies its own. A browser will limp along without them, but it gets no charset and no
// viewport meta — so the page renders desktop-width on exactly the device this whole feature exists
// to serve. The CLI's `motu lagoon serve` already re-wraps for the same reason; this is that rule,
// applied on the hosted side, to the same bytes.
//
// Tolerant on purpose: if a fragment ever arrives already wrapped (an older publish, someone's
// curl), serve it as-is rather than nesting a second <html> inside the first.

const HAS_SKELETON = /<html[\s>]/i;

export function wrapFragment(fragment, { title } = {}) {
  const body = typeof fragment === 'string' ? fragment : fragment.toString('utf8');
  if (HAS_SKELETON.test(body)) return body;
  const head = title ? `<title>${escapeHtml(title)}</title>\n` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${head}</head>
<body>
${body}</body>
</html>
`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Tell a served page which repo it belongs to, so it can ask this host about itself.
 *
 * A published lagoon is a self-contained document, so `wrapFragment` returns it untouched — there is
 * no skeleton to add a tag to. The host inserts one here instead, at the moment it serves the bytes,
 * because it is the only party that knows the answer: the page was built before anyone chose where to
 * publish it, and inside a gallery frame the URL says nothing about the repo either.
 *
 * A REPO NAME, AND NOTHING ELSE. Not a URL and not a credential — the page asks its OWN origin, and
 * whoever is reading it is already authorised (or not) by the same cookie that let them open the
 * page. That is what keeps a published lagoon free of the two things it must never carry.
 *
 * WRAP FIRST, THEN STAMP — the order matters and it is not obvious. A published lagoon is a whole
 * document nested inside the skeleton `wrapFragment` adds, so stamping the fragment puts the tag in
 * the OUTER document's body. It is in the bytes, curl finds it, and the page's own React render
 * replaces the body and takes it with it: `document.querySelector('meta[name=motu-repo]')` returns
 * null in the one place that needed it. Stamping the wrapped document puts it in the outer <head>,
 * which nothing on the page touches.
 *
 * Fails open: a document with no <head> to insert into is returned exactly as it arrived. A page that
 * cannot look up its coverage is a page missing one panel, and mangling somebody's HTML to avoid that
 * is a bad trade.
 */
export function withRepoMeta(bytes, repo) {
  if (!repo) return bytes;
  const html = typeof bytes === 'string' ? bytes : bytes.toString('utf8');
  const at = html.search(/<head[^>]*>/i);
  if (at < 0) return bytes;
  const insert = html.indexOf('>', at) + 1;
  const tag = `\n<meta name="motu-repo" content="${escapeHtml(repo)}" />`;
  return Buffer.from(html.slice(0, insert) + tag + html.slice(insert), 'utf8');
}
