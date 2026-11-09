// The club's game state for a day — the directory's header, My club's standing and the Cup all read
// it. One hook, so two pages cannot compute "the club today" two different ways.
import { useEffect, useState } from 'react';
import { clubSource, type ClubOverview } from 'demo-app';
import { appPorts } from './app-data.js';

export function useClubOverview(asOf: string): ClubOverview | null {
  const [overview, setOverview] = useState<ClubOverview | null>(null);
  useEffect(() => {
    let live = true;
    clubSource(appPorts().members)
      .overview(asOf)
      .then((o) => live && setOverview(o))
      .catch((err: unknown) => console.error('club overview failed', err));
    return () => {
      live = false;
    };
  }, [asOf]);
  return overview;
}
