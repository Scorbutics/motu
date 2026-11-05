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
import type { AvailabilityPort, AvailabilitySource, MembersPort, MembersSource } from 'demo-app';
import { membersClient, supabaseAvailabilityPort, supabaseMembersPort } from './supabase-port.js';
import { browserAvailabilityPort, browserMembersPort } from './browser-port.js';

/**
 * TRUE IN THE PUBLIC SANDBOX BUILD (`pnpm build:sandbox`), which has no server: the ports are then
 * answered in the browser from the committed seed. A build-time constant, so the branch not taken —
 * and the Supabase client with it — is dropped from the bundle.
 */
export const IN_BROWSER_DATA = import.meta.env.VITE_DATA_SOURCE === 'browser';

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

export interface AppPorts {
  members: MembersPort;
  availability: AvailabilityPort;
}

let ports: AppPorts | null = null;

/** The backend the whole app talks to: Postgres, or the browser in the sandbox. Built once. */
export function appPorts(): AppPorts {
  if (ports) return ports;
  if (IN_BROWSER_DATA) {
    ports = { members: browserMembersPort(), availability: browserAvailabilityPort() };
  } else {
    const c = appClient();
    ports = { members: supabaseMembersPort(c), availability: supabaseAvailabilityPort(c) };
  }
  return ports;
}

let sources: { members: MembersSource; availability: AvailabilitySource } | null = null;

/**
 * The application's sources, over the app's ports.
 *
 * These are the REAL sources — the same objects the unit tests drive over a hand-made port and the
 * same ones the lagoon reaches through a channel. Only the port differs between the three, which is
 * the seam the whole design is arranged around: what runs is always the app's own logic.
 */
export function appSources(): { members: MembersSource; availability: AvailabilitySource } {
  if (sources) return sources;
  const p = appPorts();
  sources = {
    members: membersSource(p.members),
    availability: availabilitySource(p.availability),
  };
  return sources;
}
