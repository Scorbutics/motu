// THE SHELL EVERY LAGOON GETS, and the groups it replaced.
//
// `/<repo>/<ref>/<slug>` used to serve the artifact's bytes, so the URL a person bookmarks had no
// rail, no dock and no lens — and a GROUP (`/g/<name>`, a curated member list plus an immutable
// manifest) was the only way to get one. `b1719dd` had already decided that was backwards and built
// the half that mattered (`frameHref`), but never gave the canonical URL the shell, so groups
// outlived their own removal.
//
// Now the page is the shell and `/__motu_frame` is the bytes. These assertions are the two halves of
// that, plus the four addresses that must stay gone.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLagoonHost } from '../src/server.mjs';

const dir = mkdtempSync(join(tmpdir(), 'motu-shell-'));
const host = createLagoonHost({ dir, token: 'T' });
await new Promise((r) => host.server.listen(0, '127.0.0.1', r));
const port = host.server.address().port;
const base = `http://127.0.0.1:${port}`;
const pub = (repo, slug, title, body) =>
  fetch(`${base}/api/publish?repo=${repo}&slug=${slug}&title=${title}`, {
    method: 'POST', headers: { authorization: 'Bearer T' }, body,
  });

await pub('acme/one', 'all', 'One', '<h1>ONE PAGE</h1>');
await pub('acme/two', 'all', 'Two', '<h1>TWO PAGE</h1>');

let pass = 0, fail = 0;
const t = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' -> ' + d : ''}`); };

const shell = await (await fetch(`${base}/acme/one/latest/all`)).text();
t('the canonical URL serves a shell, not the artifact', shell.includes('id="stage"') && !shell.includes('ONE PAGE'));
t('the shell carries the dock', shell.includes('id="tide"') || shell.includes('motu-dock') || shell.includes('Seams'), shell.length + ' bytes');
t('the rail lists BOTH lagoons', shell.includes('acme/one') && shell.includes('acme/two'));
t('the opened lagoon is the focused frame', shell.includes('/acme/one/latest/all/__motu_frame'));
t('the other lagoon points at its own address', shell.includes('/acme/two/latest/all/__motu_frame'));

const frame = await fetch(`${base}/acme/one/latest/all/__motu_frame`);
const frameText = await frame.text();
t('the frame serves the artifact', frame.status === 200 && frameText.includes('ONE PAGE'));
t('...stamped with its repo', frameText.includes('content="acme/one"'));

const idx = await (await fetch(`${base}/`)).text();
t('the root index has no Composed panel', !idx.includes('Composed'));
t('...and still lists the repositories', idx.includes('acme/one') && idx.includes('acme/two'));

t('a group URL is gone', (await fetch(`${base}/g/all`)).status === 404);
t('a manifest URL is gone', (await fetch(`${base}/m/abc/`)).status === 404);
t('the group API is gone', (await fetch(`${base}/api/group?name=x`, { method: 'POST', headers: { authorization: 'Bearer T' }, body: '[]' })).status === 404);
t('the groups API is gone', (await fetch(`${base}/api/groups`)).status === 404);

const imm = await (await fetch(`${base}/acme/one/latest/all`)).text();
t('the shell says which axis it is on', imm.includes('today') || imm.includes('this build, forever'));

host.server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
