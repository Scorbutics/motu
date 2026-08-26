// WHO MAY READ, AND WHO MAY WRITE WHAT — the host's access policy, in one place.
//
// The host began with a single global token that gated every POST and nothing else: reads were
// entirely public, and one credential could do everything. That is the right shape for a personal
// preview server and the wrong one for two things it is being asked to do now.
//
//   A LAGOON MAY NEED TO BE PRIVATE. Some pages are the point of the host — a link you send someone.
//   Others carry a coverage corpus, which is a picture of what a production application does. Both
//   live here, so visibility has to be per repo rather than a property of the whole host.
//
//   AN INGEST CREDENTIAL LIVES SOMEWHERE ELSE. A coverage proxy forwards a corpus to this host from
//   an application's own server, so its token sits in that application's environment. With one global
//   token, a leak from any adopting app is write access to EVERY repo here — including the ability to
//   overwrite published lagoons. So an ingest token is scoped to one repo and can do exactly one
//   thing.
//
// THE DEFAULT IS WHAT THE HOST ALREADY DID. No access file means: every repo public, the global token
// admits every write. Upgrading changes nothing until somebody writes a policy down.
//
// TOKENS ARE STORED HASHED. The file sits in the store directory beside the objects, and a backup of
// a preview server should not be a credential leak. Comparison is constant-time over the digests, and
// digests are a fixed 32 bytes — so the compare is total and cannot throw on a length mismatch, which
// is the failure mode that turns a wrong token into a 500 that distinguishes it from a wrong-length
// one.
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCESS_FILE = 'access.json';

/** sha256 of a secret, as bytes. Always 32 of them, whatever went in. */
export function digest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest();
}

/** Constant-time equality over digests — total, so a wrong length is a mismatch and never a throw. */
export function secretMatches(offered, expectedHashHex) {
  if (!expectedHashHex) return false;
  let expected;
  try {
    expected = Buffer.from(String(expectedHashHex), 'hex');
  } catch {
    return false;
  }
  if (expected.length !== 32) return false;
  return timingSafeEqual(digest(offered), expected);
}

/**
 * Read the policy from the store directory.
 *
 * Re-read per request rather than cached: this file changes when a person edits it, the host is a
 * long-running process nobody wants to restart, and it is a few hundred bytes. A malformed file is
 * treated as ABSENT and reported by the caller — never as "deny everything", because locking an
 * operator out of their own host over a stray comma is a worse failure than staying as open as the
 * host was yesterday.
 */
export function loadAccess(dir) {
  const file = resolve(dir, ACCESS_FILE);
  if (!existsSync(file)) return { repos: {}, readHash: null, malformed: false };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return {
      repos: raw && typeof raw.repos === 'object' && raw.repos ? raw.repos : {},
      readHash: typeof raw?.readHash === 'string' ? raw.readHash : null,
      malformed: false,
    };
  } catch {
    return { repos: {}, readHash: null, malformed: true };
  }
}

/** Is this repo's content public? Unlisted repos are, which is what the host did before this existed. */
export function isPublic(access, repo) {
  return access.repos?.[repo]?.visibility !== 'private';
}

/**
 * May this request READ this repo?
 *
 * A public repo: always. A private one: the admin token, or the host's read secret — which arrives as
 * a cookie, because the reader is a browser following a link and cannot set a header.
 */
export function canRead(access, repo, { adminOk, readSecret }) {
  if (isPublic(access, repo)) return true;
  if (adminOk) return true;
  // TWO SCOPES, and the narrow one exists because of where these end up.
  //
  // The host-wide secret opens EVERY private repo. That is right for a person carrying one cookie,
  // and wrong for a credential that has to live in an application's production environment: an
  // adopting app needs to read back its OWN accepted set, and giving it a key to every private
  // lagoon on the host to do that undoes the reason ingest tokens are scoped at all.
  //
  // Checked in this order so a repo token is enough on its own, and the host-wide one still works
  // everywhere — including on a repo that also has its own.
  if (secretMatches(readSecret, access.repos?.[repo]?.readHash)) return true;
  return secretMatches(readSecret, access.readHash);
}

/**
 * The read secret, from wherever this reader could put it.
 *
 * A BROWSER CANNOT SET A HEADER when it follows a link, so a person reading a private lagoon carries
 * a cookie. A SERVER CANNOT SEND A COOKIE it was never given, so an application reading a corpus back
 * — a status page, a CI job — carries a bearer. Same secret, two transports, because the constraint
 * is the caller's and not the policy's.
 *
 * The ingest token deliberately does NOT open this door: it is write-only so that a credential
 * sitting in somebody else's production environment cannot be used to read what is stored here.
 */
export function readSecretFrom({ cookieHeader, bearer }) {
  return cookieValue(cookieHeader, READ_COOKIE) ?? (bearer || null);
}

/**
 * May this request INGEST for this repo?
 *
 * Deliberately narrow: an ingest token grants ONE repo and only the corpus route. It cannot publish a
 * lagoon, cannot register a live frame, cannot read anything, and cannot touch another repo — because
 * it lives in the environment of an application this host does not control.
 */
export function canIngest(access, repo, offered) {
  const hash = access.repos?.[repo]?.ingestHash;
  return secretMatches(offered, hash);
}

/** The cookie a reader carries once they have opened a private link. */
export const READ_COOKIE = 'motu_read';

/** Pull one cookie out of a request without a parser dependency. */
export function cookieValue(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
