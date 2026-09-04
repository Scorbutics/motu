// The users region's binding. Same rule as the members one: motu and the region's own declaration,
// nothing else — so `removal-check` can delete this file whole rather than stripping it.
import { createRegion } from '@motu/react';
import { usersArchipelago } from 'demo-app/archipelagos/users';
import { ELEMENT_REGISTRY } from 'demo-app';

export const Users = createRegion(usersArchipelago, {
  elements: ELEMENT_REGISTRY,
  // `draft` is bound by BOTH islands and produced by the form. Until someone types, the card reads
  // whatever the page established — so the page establishes the empty draft rather than leaving the
  // card to render from `undefined` and hoping its defaults agree.
  seed: { draft: {} },
});
