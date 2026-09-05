// The profile page: who this member is, and when you can get time with them.
//
// THE WHOLE REGION IS DECLARED HERE BEFORE MOST OF IT EXISTS. Five slots, five owners, two shared
// keys — and three of the five islands are `planned: true`: surveyed, owned, and not yet built. That
// is not a placeholder convention, it is what makes the ownership below CHECKABLE today: a second
// island claiming `selectedDay` fails statically whether or not the island that owns it has been
// written. Whoever builds the calendar branches from an archipelago that already contains everyone
// else's claims, so a collision fails in their own branch on their first `motu check` rather than in
// a merge. `planned` REMOVES ITSELF — once the island is registered the flag becomes an error, so a
// survey cannot quietly decay into a list of things nobody built.
//
// THE STATE MODEL, and why each key is where it is:
//
//   member        HOST-FED. The page resolves it from the URL. No island produces it, so no island
//                 declares it — a derived key listed as an output is a claim nobody can honour.
//   calendar      HOST-FED, from `availabilitySource` over a port. Same reason.
//   draft         HOST-FED. The member, mapped into the shape the member CARD already speaks, so the
//                 card island can be reused here exactly as the users page uses it.
//   selectedDay   PRODUCED by `calendar-days`. One producer, declared.
//   selectedSlot  PRODUCED by `calendar-slots`. One producer, declared.
//
// The interesting one is `selectedDay`: `calendar-slots` READS it and must not write it. Both
// islands are about the same calendar and it is genuinely tempting to let the slot list "helpfully"
// move the day — which is exactly the second writer that makes a region impossible to reason about,
// and exactly what the single-producer rule refuses. If the slot list ever needs to change the day,
// the honest model is the one motu's own rule names: the control that owns the state is the island,
// even when others sit inside it — so the two become one island with nested slots.

import type { ArchipelagoConfig } from '@motu/core';
import { PROFILE_LAYOUT } from './profile.layout.js';

export const profileArchipelago: ArchipelagoConfig = {
  id: 'profile',
  layout: PROFILE_LAYOUT,
  islands: [
    {
      slot: 'profile-hero',
      element: 'x-profile-hero',
      // Reads two host-fed keys and produces nothing. Its only output is a navigation intent, which
      // is not a store write — so it claims no key and cannot collide with anything.
      bind: ['member', 'calendar'],
      on: {
        // `host.navigate` is an EFFECT, not a store write, which is what `on` is for. A handler that
        // set a key would be ownership expressed in a callback body: undrawable before it fires, and
        // unmaterialisable when motu is ejected.
        'profile-back': (_detail, { host }) => host.navigate('/'),
      },
    },
    {
      // THE SAME ISLAND THE USERS PAGE USES, in a second region, unchanged. An island is a component
      // behind a declared boundary — not a page fragment — so appearing twice costs nothing and
      // proves the boundary is real. It reads `draft`, which the page feeds from the member row.
      slot: 'member-card',
      element: 'x-member-card',
      bind: { draft: 'draft' },
    },
    {
      slot: 'calendar-days',
      element: 'x-calendar-days',
      planned: true,
      // Reads the whole calendar and the current choice; OWNS the choice of day.
      bind: ['calendar', 'selectedDay'],
      writes: { 'day-selected': 'selectedDay' },
    },
    {
      slot: 'calendar-slots',
      element: 'x-calendar-slots',
      planned: true,
      // READS `selectedDay` — deliberately does not write it. See the note above.
      bind: ['calendar', 'selectedDay', 'selectedSlot'],
      writes: { 'slot-selected': 'selectedSlot' },
    },
    {
      slot: 'booking-summary',
      element: 'x-booking-summary',
      planned: true,
      // A pure projection of three keys. No `writes`, no `on`: it confirms a choice, it does not
      // make one — which is what makes it the island a flow should assert on. A step that drives
      // `calendar-slots` and asserts on THIS slot cannot pass by storing what it was handed.
      bind: ['member', 'selectedDay', 'selectedSlot'],
    },
  ],
};
