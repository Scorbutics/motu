// The review console — a route on this host, not a port beside it.
//
// It used to be a Vite app served out of `review-console/dist` by a catch-all that streamed files off
// disk, with its own build, its own React and its own published lagoon. It is the same components and
// the same declared region; what went away is the second project around them.
//
// A THIN SERVER COMPONENT. The console fetches its own data from `/api/*` — same origin, and the
// routes are already gated by `authorize` — so unlike the front page there is nothing to read from
// the store here. That is worth revisiting: reading it on the server would remove a round trip and
// let the console see exactly what the visitor may see, which is the same question `page.tsx`
// already answers. Not in the move.
import { createClient } from '@/src/supabase/server';
import { viewerFrom } from '@/src/auth/viewer';
import { ConsoleScreen } from '@/app/console/console-screen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Baseline review' };

/**
 * WHETHER THERE IS ANYBODY TO ACCEPT AS, read on the SERVER.
 *
 * Not fetched after hydration: the alternative renders "sign in to accept" first and swaps, so every
 * signed-in reviewer watches themselves be told they cannot do the thing they came to do.
 */
export default async function ConsolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let viewer = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    viewer = viewerFrom(data.user);
  } catch {
    // An unreadable session is NOBODY, not an error — the rule every route here keeps.
  }
  // `?repo=` is where a lagoon's own Baselines button lands. Read on the server so the console opens
  // on that project rather than flashing the picker first.
  const params = await searchParams;
  const wanted = typeof params.repo === 'string' ? params.repo : null;
  return <ConsoleScreen viewer={viewer} repo={wanted} />;
}
