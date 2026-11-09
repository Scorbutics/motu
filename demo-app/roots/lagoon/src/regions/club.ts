// The events page and My club, as the lagoon installs them — ONE module, used by BOTH entries.
//
// The gallery (`main.tsx`) and the focused entry the checks drive (`lagoon.tsx`) each used to need
// their own copy, and the first version put the channels only in the gallery: the regions looked right
// to a person and every flow failed in `--runtime`, because the source a flow drives was never
// installed where the flows run. One import in each entry makes that impossible to repeat.
//
// Each region installs the app's OWN `eventsSource` over the seed port, pinned to the evidence
// morning. A FACTORY rather than a port: every view and every flow gets a fresh calendar, so an RSVP
// pressed in one does not leak into the next. Source keys are not seeded here — the source produces
// them.
import { channelFrom } from '@motu/core';
import { overridesFor } from '@motu/react';
import { ALL_EVENTS, CHAPTERS, SEED_MEMBERS, eventsArchipelago, homeArchipelago, seedEventsPort } from 'demo-app';
import { DENNIS as SIGNED_IN, EVIDENCE_NOW, UPCOMING } from 'demo-app/evidence/events';
import { CLUB, EVIDENCE_DAY } from 'demo-app/evidence/club';

const seedPort = () => seedEventsPort({ members: SEED_MEMBERS, now: () => EVIDENCE_NOW });
const clock = { now: () => EVIDENCE_NOW };

export const eventsRegion = overridesFor(eventsArchipelago, {
  // OPENED ON THE SOONEST EVENT, as the page opens it (`EventsPage` seeds the first one once the
  // calendar arrives). With `null` the preview showed "Pick an event" — a screen nobody lands on.
  seed: { me: SIGNED_IN, filter: ALL_EVENTS, selectedEventId: UPCOMING[0]!.id },
  channels: [channelFrom({ to: eventsArchipelago, id: 'events', channelName: 'events: the page’s events source, over the seed', args: [seedPort, clock] })],
});

export const homeRegion = overridesFor(homeArchipelago, {
  seed: { me: SIGNED_IN, asOf: EVIDENCE_DAY, overview: CLUB, chapters: CHAPTERS, selectedEventId: null },
  channels: [channelFrom({ to: homeArchipelago, id: 'events', channelName: 'home: the page’s events source, over the seed', args: [seedPort, clock] })],
});

export { SIGNED_IN };
