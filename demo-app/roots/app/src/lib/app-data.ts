// The application's own data access, assembled once.
//
// WHY THE CLIENT IS MEMOISED HERE RATHER THAN CREATED IN `main.tsx` AND PASSED DOWN. `main.tsx`
// needs it for the contract transport and the profile page needs it for its two sources; building
// two clients would mean two connection pools and two auth states for one anon key, and threading
// one through props would put a Supabase client in the type of every screen it passes.
//
// NOTE WHAT IS *NOT* HERE: no motu import of any kind. This is the application's own code, it is the
// half `removal-check` must leave standing, and the composition roots beside it stay deletable
// precisely because everything that needs the vendor lives in files like this one.
import type { SupabaseClient } from '@supabase/supabase-js';
import { availabilitySource, membersSource } from 'demo-app';
import type { AvailabilitySource, MembersSource } from 'demo-app';
import { membersClient, supabaseAvailabilityPort, supabaseMembersPort } from './supabase-port.js';

let client: SupabaseClient | null = null;

/** The one client this app talks to Postgres through. */
export function appClient(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    // A blank page with a console warning is how a demo dies on camera. Say what is missing and
    // where the answer comes from.
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.\n' +
        'Run `pnpm db:start` in this directory and copy the printed values into roots/app/.env.local ' +
        '(there is a .env.example beside it).',
    );
  }
  client = membersClient(url, anonKey);
  return client;
}

let sources: { members: MembersSource; availability: AvailabilitySource } | null = null;

/**
 * The application's sources, over Supabase ports.
 *
 * These are the REAL sources — the same objects the unit tests drive over a hand-made port and the
 * same ones the lagoon reaches through a channel. Only the port differs between the three, which is
 * the seam the whole design is arranged around: what runs is always the app's own logic.
 */
export function appSources(): { members: MembersSource; availability: AvailabilitySource } {
  if (sources) return sources;
  const c = appClient();
  sources = {
    members: membersSource(supabaseMembersPort(c)),
    availability: availabilitySource(supabaseAvailabilityPort(c)),
  };
  return sources;
}
