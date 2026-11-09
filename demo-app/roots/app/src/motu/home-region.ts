// My club's binding. Like the events binding, it installs the events source over the app's port —
// the same source, the same factory — so cancelling here and on the events page is one code path.
import { createRegion } from '@motu/react';
import { channelFrom } from '@motu/core';
import { homeArchipelago } from 'demo-app/archipelagos/home';
import { ELEMENT_REGISTRY, IDLE_RSVP } from 'demo-app';
import { useHostBridge } from '../lib/routing.js';
import { appPorts } from '../lib/app-data.js';

export const Home = createRegion(homeArchipelago, {
  elements: ELEMENT_REGISTRY,
  useHost: useHostBridge,
  channels: [channelFrom({ to: homeArchipelago, id: 'events', args: [() => appPorts().events, { now: () => new Date().toISOString() }] })],
  seed: {
    me: null,
    asOf: null,
    overview: null,
    chapters: [],
    selectedEventId: null,
    events: [],
    myRsvps: [],
    rsvp: IDLE_RSVP,
    attendees: [],
    eventsLoading: true,
  },
});
