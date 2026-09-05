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
import { MEMBER_SEARCH_CONFIG } from 'demo-app/search-config';
import { ELEMENT_REGISTRY } from 'demo-app';
import { useHostBridge } from '../lib/routing.js';

// `searchConfig` is bound by the search island and written by NO island — a host-fed key. The page
// establishes it, which is what `seed` is for.
//
// SEEDED HERE, not from `main.tsx`. `Members.seed()` writes into a store that `defineArchipelago`
// creates on the provider's first render, so a call at module scope in the composition root warns
// "no archipelago to seed" and does nothing. Passing it to `createRegion` hands it to the provider,
// which is the only moment that is neither too early nor a render.
export const Members = createRegion(membersArchipelago(), {
  elements: ELEMENT_REGISTRY,
  // THE OUTWARD SEAM, and it was missing. The archipelago's `member-open` handler calls
  // `host.navigate`, and with no `useHost` the bridge is undefined — so clicking a row threw
  // `Cannot read properties of undefined (reading 'navigate')` and nothing happened. It went unseen
  // because the path it navigated to (`/member/edit?id=…`) was a screen this app never had, so the
  // only way to notice was to click a row and read the console. No motu check covers this: the
  // handler body is code, `on` is for effects, and an effect that throws is the host's business.
  useHost: useHostBridge,
  // BOTH host-fed keys, established here. `criteria` is read by three islands and written by the
  // search — until someone searches, every reader sees `undefined`. The lagoon cannot tell you that,
  // because the lagoon seeds the key itself; `integrate check` is what noticed.
  seed: { searchConfig: MEMBER_SEARCH_CONFIG, criteria: {} },
});
