// Publishing a lagoon to a host instead of to a file.
//
// The artifact is unchanged — `motu lagoon publish` builds the same self-contained fragment it always
// did, writes it to the same stable path, and `--remote` additionally POSTs those exact bytes. Local
// and hosted therefore cannot drift: there is one build and one file, and the host is a second
// destination for it rather than a second pipeline.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * ONE host for every agent on this machine.
 *
 * The point of a long-running host is that nobody has to be told where it is: an agent runs
 * `motu lagoon publish --remote` with no argument, in whatever project it happens to be working on,
 * and lands in the same place as every other agent. So the URL and token have a well-known home,
 * and the flag and the environment variable stay available to override it.
 *
 * Precedence: an explicit flag, then $MOTU_HOST_URL / $MOTU_HOST_TOKEN, then this file.
 */
export function loadHostConfig() {
  const file = resolve(process.env.MOTU_CONFIG_HOME || resolve(homedir(), '.config/motu'), 'host.json');
  if (!existsSync(file)) return {};
  try {
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    return { url: typeof cfg.url === 'string' ? cfg.url : undefined, token: typeof cfg.token === 'string' ? cfg.token : undefined, file };
  } catch {
    // A malformed file must not stop a publish that also has a flag or an env var.
    return {};
  }
}

/** Run git, quietly. Absence of git, or of a repo, is a normal case here — not an error. */
function git(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return res.status === 0 ? res.stdout.trim() : null;
}

/** Trim a host-safe segment out of a git ref or a directory name. */
function segment(raw, max = 64) {
  const s = String(raw ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return /^[A-Za-z0-9]/.test(s) ? s : null;
}

/**
 * WHO IS PUBLISHING? With no accounts yet, the repo id has to come from the repo itself, and the git
 * remote is the only name that is stable across machines and clones — a directory name is whatever
 * someone typed when they cloned. Falls back to the directory when there is no remote (or no git),
 * because a project that has not been pushed anywhere must still be publishable.
 */
export function gitIdentity(cwd) {
  const origin = git(cwd, ['remote', 'get-url', 'origin']);
  let repo = null;
  if (origin) {
    // Both spellings of a remote: git@host:owner/name.git and https://host/owner/name.git
    const m = origin.replace(/\.git$/, '').match(/[:/]([^/:]+)\/([^/]+)$/);
    if (m) {
      const owner = segment(m[1]);
      const name = segment(m[2]);
      if (owner && name) repo = `${owner}/${name}`;
    }
  }
  if (!repo) repo = segment(basename(cwd));

  const sha = git(cwd, ['rev-parse', 'HEAD']);
  const branchRaw = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = git(cwd, ['status', '--porcelain']);
  return {
    repo,
    // A dirty tree's HEAD sha would be a LIE about what those bytes are: the immutable URL would name
    // a commit that does not contain what you are looking at. Let the host fall back to the content
    // hash instead — it is always true, and it is what content addressing is for.
    sha: sha && !dirty ? sha.slice(0, 12) : null,
    branch: branchRaw && branchRaw !== 'HEAD' ? segment(branchRaw) : null,
    dirty: !!dirty,
  };
}

/** POST the fragment. Gzipped: ~430 kB of inlined bundle goes over the wire at roughly a quarter. */
export async function uploadLagoon({ url, token, repo, slug, title, sha, branch, body }) {
  const base = String(url).replace(/\/+$/, '');
  const qs = new URLSearchParams({ repo, slug, title });
  if (sha) qs.set('sha', sha);
  if (branch) qs.set('branch', branch);

  const gz = gzipSync(Buffer.from(body, 'utf8'));
  const res = await fetch(`${base}/api/publish?${qs}`, {
    method: 'POST',
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-encoding': 'gzip',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: gz,
  });

  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    /* a non-JSON body means a proxy answered, not the host — report it verbatim below */
  }
  if (!res.ok) {
    const detail = payload?.error ?? text.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(`host refused the upload (${res.status}): ${detail || 'no detail'}`);
  }
  return { ...payload, base, sentBytes: gz.length };
}
