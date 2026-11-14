// The events region's binding — and the one binding here that has to name the application's data.
//
// Its declared SOURCE takes a PORT, and `channels` is a `createRegion` option fixed at module scope,
// so the port is named here: a factory over `appPorts()`, called when the source is installed, not
// when this module is imported. So this file is not 100% motu (nor is any binding here: they all take
// the app's `useHostBridge`), and `removal-check` unwraps it rather than deleting it whole — verified,
// the host still typechecks with motu removed.
import { createRegion } from '@motujs/react';
import { channelFrom } from '@motujs/core';
import { eventsArchipelago } from 'demo-app/archipelagos/events';
import { ALL_EVENTS, ELEMENT_REGISTRY, IDLE_RSVP } from 'demo-app';
import { useHostBridge } from '../lib/routing.js';
import { appPorts } from '../lib/app-data.js';

export const Events = createRegion(eventsArchipelago, {
  elements: ELEMENT_REGISTRY,
  useHost: useHostBridge,
  // THE SAME CALL THE LAGOON MAKES, over Postgres (or the sandbox's browser port) instead of the seed.
  channels: [channelFrom({ to: eventsArchipelago, id: 'events', args: [() => appPorts().events, { now: () => new Date().toISOString() }] })],
  // EVERY KEY ESTABLISHED BEFORE THE FIRST PAINT, the source's included: until it answers, every
  // reader sees an empty calendar that is loading, not `undefined`.
  seed: {
    me: null,
    filter: ALL_EVENTS,
    selectedEventId: null,
    events: [],
    myRsvps: [],
    rsvp: IDLE_RSVP,
    attendees: [],
    eventsLoading: true,
  },
});
