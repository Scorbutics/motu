// The sign-in screen. A SERVER component: it reads what GoTrue bounced back with and hands it to the
// client boundary, which is the only reader of `error_description` in the app.
//
// A route the APP owns. Everything else still falls through the phase-0 catch-all to `store.mjs` —
// see docs/plan-lagoon-host.md.
import { SignInScreen } from '@/app/signin/signin-screen';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // GoTrue's own words when it can supply them, its error code when it cannot. Passed through
  // verbatim: the region type says why a paraphrase here would be the wrong kind of help.
  const raw = params.error_description ?? params.error;
  // Where they were going when they were bounced here. Passed through UNVALIDATED on purpose — the
  // guard lives in `signin-source.ts`, so it runs in the lagoon and under a unit test too. Screening
  // it here as well would put a second copy of the rule in the one place neither can reach.
  const next = params.next;
  return (
    <SignInScreen
      authError={typeof raw === 'string' ? raw : null}
      returnTo={typeof next === 'string' ? next : null}
    />
  );
}
