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
