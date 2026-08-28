// ACCEPTING A BASELINE, gated by who you are rather than by what you pasted.
//
// The console asked for an admin token and kept it in localStorage. That made sense when it was a
// separate Vite app talking to a host that only understood one credential: a bearer, all-or-nothing,
// every repo. It stopped making sense the moment the console moved in here, because this app already
// knows who you are — a GitHub session, a `repo_access` row per repository, an `authorize` that
// answers per repo — and accepting a baseline is exactly the kind of act that identity is for.
//
// THE SAME SHAPE THE RECORD PATH USES: decide here with the visitor's identity, then present the
// HOST's own credential for the hop that does the work. The host keeps its single-credential model
// and never learns about sessions; this route is the translation.
//
// WHY ACCEPTING IS GATED ON READ ACCESS. `authorize` answers "may this person SEE this repo", and
// accepting is a write. Today those are the same set — anyone who can see a project's baselines on
// this host is someone who was granted the repository on GitHub — so read access is the honest
// available answer rather than a stand-in for a permission model that does not exist yet. When it
// does, this is the one line that changes, and the comment is here so it is changed deliberately.
import { cookies } from 'next/headers';
import { authorize } from '@/src/auth/authorize';
import { postgresProjectStore, postgresMembershipStore } from '@/src/auth/stores';
import { postgresAccessStore } from '@/src/auth/access-store';
import { postgresShareLinkStore } from '@/src/auth/share-link-store';
import { createClient } from '@/src/supabase/server';
import { normalizeRepo, normalizeSegment, access } from '@/src/host/store';
import { hostAdminCredential, proxyToHost } from '@/src/upstream';
import { canRead } from '@motu/host/src/access.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const refuse = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function POST(request: Request) {
  const url = new URL(request.url);
  const repo = normalizeRepo(url.searchParams.get('repo') ?? '');
  if (!repo) return refuse(400, 'repo is required');

  let viewer: { userId: string } | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    viewer = data.user ? { userId: data.user.id } : null;
  } catch {
    // An unreadable session is NOBODY, not an error — the rule every other route here keeps.
  }
  // SIGNED IN OR NOTHING. Unlike reading, where a public repo is genuinely readable by anyone, there
  // is no anonymous accept: it changes what everybody else sees.
  if (!viewer) return refuse(401, 'sign in to accept baselines');

  const jar = await cookies();
  const decision = await authorize(
    { viewer, shareToken: jar.get('motu_share')?.value ?? null },
    { repo, ref: 'latest', slug: normalizeSegment(url.searchParams.get('island') ?? '') ?? 'all' },
    {
      projects: postgresProjectStore(),
      memberships: postgresMembershipStore(),
      access: postgresAccessStore(),
      shareLinks: postgresShareLinkStore(),
    },
  );

  // ABSTAIN IS NOT A YES HERE, and that is the difference from the read path. There, abstaining means
  // "the host decides as it always has", and the host's own gate then runs. For a WRITE the host would
  // accept our bearer without asking anything, so stepping aside would mean nobody decided at all.
  // Fall back to what access.json says about this repo, and refuse if that is not a yes.
  const allowed =
    decision.outcome === 'allow' ||
    (decision.outcome === 'abstain' &&
      (canRead(access(), repo, { adminOk: false, readSecret: null }) as boolean));
  if (!allowed) return refuse(404, `nothing at ${repo}`);

  // ALLOWED: do the work with the host's credential, which the browser never sees.
  const admin = hostAdminCredential();
  if (!admin.authorization) {
    // CONFIGURED OR REFUSED, never silently forwarded without it: the host would answer 401 and the
    // console would show "bad or missing token", which points at the visitor instead of at the
    // deployment that is missing MOTU_HOST_ADMIN_TOKEN.
    return refuse(503, 'this host cannot accept baselines — MOTU_HOST_ADMIN_TOKEN is not set');
  }
  return proxyToHost(request, { setHeaders: admin });
}
