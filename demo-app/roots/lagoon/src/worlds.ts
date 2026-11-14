// THE CLUB'S WORLDS: answers that differ from the default lagoon, for the states no flow could reach
// (docs/proposals/worlds.md). Handed to BOTH entries — the gallery (`main.tsx`) and the focused entry
// every check drives (`lagoon.tsx`) — so a link and a check see the same world.
//
// Nothing here is invented: the latency is the port's own option, and the members are seed rows.
import { defineWorlds } from '@motujs/react';
import { SEED_MEMBERS, seedEventsPort } from 'demo-app';
import { EVIDENCE_NOW, KAREN } from 'demo-app/evidence/events';

const clock = { now: () => EVIDENCE_NOW };

export const worlds = defineWorlds({
  // The events service answering slowly. The page's own events source still runs; only its port
  // waits, so what renders meanwhile is what the app shows on a slow connection — `eventsLoading`,
  // a key the source produces and no seed could honestly set.
  'slow-backend': {
    description: 'the events service answers after 4 s, as on a slow connection',
    regions: {
      events: {
        channels: { events: [() => seedEventsPort({ members: SEED_MEMBERS, now: () => EVIDENCE_NOW, latencyMs: 4000 }), clock] },
      },
    },
  },
  // Someone else signed in: Karen Okonkwo, whose membership is SUSPENDED (seed row 702524). On a screen
  // the signed-in member is what the page hands the shell — a FACT `screens.ts` reads — and in a region
  // view it is the regions' `me`, host-fed, so a seed.
  'karen-signed-in': {
    description: 'Karen Okonkwo, whose membership is suspended, is the one signed in',
    facts: { signedIn: KAREN },
    regions: {
      shell: { seed: { me: KAREN } },
      events: { seed: { me: KAREN } },
      home: { seed: { me: KAREN } },
    },
  },
});
