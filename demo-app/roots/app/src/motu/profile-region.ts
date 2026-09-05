// The profile region's binding. motu and the region's own declaration, NOTHING ELSE in this file.
//
// Same rule as the other two roots, and it is not tidiness: `removal-check` deletes a composition
// root WHOLE only when every import it makes is motu's. One application import and the file is
// stripped instead, which leaves `createRegion(...)` behind with its imports gone and errors on
// lines that look fine. So the Supabase client, the sources and the fetching live in `lib/` and in
// the page; this file only binds.
import { createRegion } from '@motu/react';
// NOT FROM THE PROJECT BARREL: `demo-app`'s index pulls in every island, so an island reaching an
// application page that composes this region would close a cycle back to here. The registry is fine
// to take from the barrel because handing it over is the barrel's whole job.
import { profileArchipelago } from 'demo-app/archipelagos/profile';
import { ELEMENT_REGISTRY } from 'demo-app';
import { useHostBridge } from '../lib/routing.js';

export const Profile = createRegion(profileArchipelago, {
  elements: ELEMENT_REGISTRY,
  // The outward seam. The hero's back control emits a navigation INTENT; this is what turns it into
  // a URL. Islands never import the router — there isn't one — and the region is what decides that
  // "back" means the directory.
  useHost: useHostBridge,
  // THE RESTING STATE OF EVERY KEY, established before the first paint.
  //
  // All five matter, and two of them are the ones an island OWNS: `selectedDay` and `selectedSlot`
  // are produced by the calendar islands, which means the page may not `provide` them — the region's
  // host-side type omits a produced key, so assigning one is a compile error. `seed` is the
  // sanctioned way to establish such a key, and establishing it is not optional: before anyone picks
  // a day, every reader would otherwise see `undefined`, and `undefined` is not the same as "nothing
  // picked yet" to a component that distinguishes them. The lagoon cannot catch this because a
  // preview seeds its own keys; the page is the only place the empty screen actually happens.
  seed: {
    member: null,
    draft: {},
    calendar: null,
    selectedDay: null,
    selectedSlot: null,
  },
});
