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
import { ConsoleScreen } from '@/app/console/console-screen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Baseline review' };

export default function ConsolePage() {
  return <ConsoleScreen />;
}
