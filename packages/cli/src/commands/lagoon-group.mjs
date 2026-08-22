// `motu lagoon group` / `motu lagoon groups` — the composed multi-repo gallery, as a command.
//
// This existed as raw curl against /api/group first, which is not a workflow: the whole point of the
// host is that an agent finishing UI work leaves a human one link, and "POST this JSON array" is not
// something a skill can be asked to do reliably. So the gallery is declared the same way everything
// else is — a motu command that reads ~/.config/motu/host.json and prints the URL.
//
//   motu lagoon groups                          what galleries exist
//   motu lagoon group product --all             every repo the host knows, its switcher entry
//   motu lagoon group product --add acme/web    add one member (defaults to the `all` switcher)
//   motu lagoon group product --add acme/web:archipelago-billing,acme/admin --remove old/thing
//
// `--all` is the one that answers "set the lagoon up with every project": the host already knows
// which repositories have published, so the gallery does not need to be maintained by hand.
import { color } from '../lib/util.mjs';
import { loadHostConfig } from '../lib/remote.mjs';

/** Resolve the host the same way `publish --remote` does, so both obey one configuration. */
function resolveHost(argv) {
  const cfg = loadHostConfig();
  const url = (typeof argv.remote === 'string' ? argv.remote : null) || process.env.MOTU_HOST_URL || cfg.url;
  const token = (typeof argv.token === 'string' ? argv.token : null) || process.env.MOTU_HOST_TOKEN || cfg.token || null;
  if (!url) {
    console.error(color.red('✗ no lagoon host — pass --remote <url>, set MOTU_HOST_URL, or write ~/.config/motu/host.json'));
    process.exit(1);
  }
  return { base: String(url).replace(/\/+$/, ''), token };
}

async function api(base, path, init = {}) {
  let res;
  try {
    res = await fetch(`${base}${path}`, init);
  } catch (err) {
    throw new Error(`cannot reach the lagoon host at ${base} — ${err.message}`);
  }
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    /* a non-JSON body means something other than the host answered */
  }
  if (!res.ok) throw new Error(payload?.error ?? `${res.status} ${text.slice(0, 160).replace(/\s+/g, ' ').trim()}`);
  return payload;
}

/** `acme/web`, `acme/web:slug` — the slug defaults to the switcher entry, which is the gallery. */
function parseMember(spec) {
  const [repo, slug] = String(spec).split(':');
  if (!repo) return null;
  return { repo, slug: slug || 'all' };
}

/**
 * COMMA-SEPARATED, not a repeated flag. The CLI's shared argv parser assigns `out[key] = value`, so a
 * second `--add` silently overwrites the first — the kind of loss that looks like the command worked.
 * Widening the parser would change every command's flag semantics at once, so the list lives in the
 * value: `--add acme/web,acme/admin:archipelago-billing`.
 */
const memberList = (argv, key) =>
  typeof argv[key] === 'string' ? argv[key].split(',').map((x) => x.trim()).filter(Boolean) : [];

export async function lagoonGroupsCommand(argv) {
  const { base } = resolveHost(argv);
  const { groups } = await api(base, '/api/groups');
  if (argv.json) {
    console.log(JSON.stringify({ ok: true, host: base, groups }, null, 2));
    return 0;
  }
  if (!groups.length) {
    console.log(color.dim(`no galleries on ${base} — motu lagoon group <name> --all`));
    return 0;
  }
  for (const g of groups) {
    console.log(`${color.bold(g.name)}  ${color.dim(`${base}/g/${g.name}`)}`);
    for (const m of g.members) console.log(color.dim(`  ${m.repo}:${m.slug}`));
  }
  return 0;
}

export async function lagoonGroupCommand(argv) {
  const name = argv._[0];
  if (!name) {
    console.error(color.red('✗ motu lagoon group <name> [--all] [--add <repo>[:<slug>][,…]] [--remove <repo>[:<slug>][,…]]'));
    process.exit(2);
  }
  const { base, token } = resolveHost(argv);

  // Start from what the group already is, so --add/--remove are edits rather than a redefinition.
  const { groups } = await api(base, '/api/groups');
  const existing = groups.find((g) => g.name === name);
  let members = existing ? existing.members.map((m) => ({ repo: m.repo, slug: m.slug })) : [];

  if (argv.all) {
    // Every repository that has published, at its switcher entry — the gallery of galleries. Repos
    // with no `all` entry contribute their first slug instead, so a project that only ever publishes
    // one focused archipelago is not silently left out of the composed view.
    const { repos } = await api(base, '/api/repos');
    members = repos
      .map((r) => ({ repo: r.repo, slug: r.slugs.includes('all') ? 'all' : r.slugs[0] }))
      .filter((m) => m.slug);
  }

  for (const spec of memberList(argv, 'add')) {
    const m = parseMember(spec);
    if (!m) {
      console.error(color.red(`✗ --add wants <repo>[:<slug>], got "${spec}"`));
      process.exit(2);
    }
    if (!members.some((x) => x.repo === m.repo && x.slug === m.slug)) members.push(m);
  }
  for (const spec of memberList(argv, 'remove')) {
    const m = parseMember(spec);
    if (!m) continue;
    // A bare `--remove acme/web` drops every slug of that repo; with a slug it drops just the one.
    const bare = !String(spec).includes(':');
    members = members.filter((x) => !(x.repo === m.repo && (bare || x.slug === m.slug)));
  }

  if (!members.length) {
    console.error(color.red(`✗ "${name}" would have no members — nothing published yet, or every member removed`));
    process.exit(1);
  }

  const out = await api(base, `/api/group?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(members),
  });

  const url = `${base}/g/${name}`;
  if (argv.json) {
    console.log(JSON.stringify({ ok: true, name, url, members: out.members, manifest: out.manifest, missing: out.missing }, null, 2));
    return 0;
  }
  console.log('');
  // The stored list and the VIEW are not the same number when a member has published nothing, and
  // reporting the stored count alone read as "4 lagoons" above a warning saying one of them is absent.
  const missing = out.missing ?? [];
  const shown = out.members.length - missing.length;
  console.log(
    `${color.green('✓')} ${color.bold(name)} — ${shown} lagoon(s)` +
      (missing.length ? color.yellow(` (${out.members.length} declared, ${missing.length} not published yet)`) : ''),
  );
  for (const m of out.members) console.log(color.dim(`  ${m.repo}:${m.slug}`));
  // A member that resolves to nothing is the failure this command can actually have: the group is
  // stored, the composed view silently renders one frame fewer.
  for (const m of out.missing ?? []) console.log(color.yellow(`  ! ${m.repo}:${m.slug} has published nothing — not in the view`));
  console.log(`  ${url}`);
  return 0;
}
