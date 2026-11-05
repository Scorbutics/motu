// The club's game state, over the members port.
//
// The game has no table of its own (see `gamification.ts`): it is computed from every member row. So
// the source asks the SAME port the directory asks — Postgres in the app, the seed in the sandbox and
// the lagoon — for the whole membership, and hands it to the rules. One fetch of 240 rows; a club
// with tens of thousands would want this computed by the backend, and the port is where that swap
// would happen without anything above it changing.
import { clubOverview, type ClubOverview } from './gamification.js';
import type { MembersPort } from './members-source.js';

/** Enough to cover the whole club in one page. */
const WHOLE_CLUB = 100_000;

export function clubSource(port: MembersPort) {
  return {
    async overview(asOf: string): Promise<ClubOverview> {
      const { rows } = await port.search({}, 0, WHOLE_CLUB);
      return clubOverview(rows, asOf);
    },
  };
}

export type ClubSource = ReturnType<typeof clubSource>;
