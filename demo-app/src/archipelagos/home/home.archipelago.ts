// My club: the landing page of a signed-in member — who you are in the club today, the events you
// are going to, your chapter, and the club's quest and Cup.
//
// TWO OF ITS ISLANDS ALREADY EXISTED. `x-weekly-quest` and `x-chapter-cup` are the directory's side
// column, placed here in a second region with nothing changed: they read `overview`, and this region
// feeds `overview` the same way the directory does. An island is a component with a declared surface,
// so reusing one is a placement, not a fork.
//
// THE STATE MODEL:
//
//   me, asOf, overview, chapters   HOST-FED — the session, the day, the club, the chapter list.
//   events, myRsvps, rsvp, attendees, eventsLoading
//                                  PRODUCED by the SAME `events` source as the events page. Cancelling
//                                  here is the same `event-rsvp` intent, answered by the same object,
//                                  so the two pages cannot disagree about whether you are going.
//   selectedEventId                the source's input; nothing on this page selects an event, so it
//                                  stays null and no attendees are loaded.
import { archipelago } from '@motu/core';
import type { ElementTypes } from '../../islands/registry.js';
import type { HomeRegion, ProducedHomeKeys } from './home.region.js';
import { eventsSource } from '../../shared/events-source.js';
import { HOME_LAYOUT } from './home.layout.js';

export const homeArchipelago = archipelago<HomeRegion, ElementTypes, ProducedHomeKeys>()(
  {
    id: 'home',
    layout: HOME_LAYOUT,
    islands: [
      { slot: 'my-standing', element: 'x-my-standing', bind: ['me', 'asOf', 'overview', 'myRsvps'] },
      {
        slot: 'my-events',
        element: 'x-my-events',
        bind: ['events', 'myRsvps', 'me', 'rsvp', 'eventsLoading'],
        intents: { 'event-rsvp': 'event-rsvp' },
        on: { 'events-browse': (_d, { host }) => host.navigate('/events') },
      },
      {
        slot: 'my-chapter',
        element: 'x-my-chapter',
        bind: ['me', 'chapters', 'events', 'overview'],
        on: { 'chapter-open': (slug, { host }) => host.navigate(slug ? '/chapters/' + encodeURIComponent(String(slug)) : '/chapters') },
      },
      { slot: 'home-quest', element: 'x-weekly-quest', bind: ['overview'] },
      { slot: 'home-cup', element: 'x-chapter-cup', bind: ['overview'] },
    ],
    sources: { events: eventsSource },
  } as const,
  { ownership: true, wiring: true, produced: true },
);
