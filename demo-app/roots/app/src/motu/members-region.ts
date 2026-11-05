// The region binding, and NOTHING ELSE IN THIS FILE.
//
// It imports motu and the demo project's own declarations — no Supabase client, no service, no
// browser API. That is not tidiness: `removal-check` deletes a composition root WHOLE only when
// every import it makes is motu's. One application import and the file is stripped instead, which
// leaves `createRegion(...)` behind with its imports gone and errors on lines that look fine.
//
// So the port, the client and the transport live in `lib/`, and `main.tsx` puts them together.
import { createRegion } from '@motu/react';
// NOT FROM THE PROJECT BARREL. `demo-app`'s index pulls in every island, so an island that reaches
// an application page composing this region closes a cycle back to here — and `membersArchipelago`
// is then read before it is initialised. `integrate check` names this one; the registry is fine to
// take from the barrel because it is the barrel's whole job.
import { membersArchipelago } from 'demo-app/archipelagos/members';
import { ELEMENT_REGISTRY } from 'demo-app';
import { useHostBridge } from '../lib/routing.js';

// EVERY KEY ESTABLISHED BEFORE THE FIRST PAINT. `criteria` is written by the search box and the plan
// tabs — until someone uses either, every reader sees the empty filter rather than `undefined`. The
// three host-fed keys start empty and the page fills them: `overview` once the club is computed,
// `asOf` and `dataSource` straight away.
export const Members = createRegion(membersArchipelago(), {
  elements: ELEMENT_REGISTRY,
  // THE OUTWARD SEAM. The table, the podium and the feed emit `member-open`, and the region turns it
  // into a URL through this bridge.
  useHost: useHostBridge,
  seed: { criteria: {}, overview: null, asOf: null, dataSource: null, selectedMember: null, resultCount: null },
});
