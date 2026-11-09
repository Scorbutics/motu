// The lagoon gallery entry.
//
// MIGRATED FROM A HAND-ROLLED GALLERY. This file used to be the gallery itself: it configured the
// transport, mounted the fit toggle, built its own archipelago switcher with its own
// localStorage keys, injected the frame stylesheets, and mounted the tide line. All of that now lives
// in @motu/react (`startLagoon`), which is what `motu init` scaffolds and what every other project
// uses — so improvements to the gallery arrive with the framework instead of needing this file
// rewritten.
//
// It mattered beyond tidiness: the chrome moved OUT of the artifact, and a hand-rolled gallery
// publishes neither the catalogue nor the control surface the host's sidebar reads. This project was
// the only one left drawing its own dock, and so the only one that could not show the region sheet,
// the seams, the island scope or coverage.
//
// What stays here is only what Vite requires in the app: the build-time defines, the project's own
// registry and stylesheet, the frame glob, and the debug overlay — which @motu/react must not depend
// on, so the app hands it in.
import { HttpTransport } from '@motu/runtime';
import { setDefaultIsolation, type HostBridge } from '@motu/core';
import { startLagoon, overridesFor, type TransportMode } from '@motu/react';
import {
  mountDebugOverlay,
  toggleDebugOverlay,
  isDebugOverlayOpen,
  subscribeDebugOverlay,
  mountFindings,
  currentFindings,
  currentSheet,
  currentSeams,
  currentIslands,
  currentCoupling,
  currentCoverage,
  watchSeams,
  toggleRecording,
  recordingState,
  setPicking,
  onIslandPicked,
  setCoupling,
  couplingOn,
} from '@motu/debug-overlay';
import { ELEMENT_REGISTRY, ARCHIPELAGOS, membersArchipelago, usersArchipelago, profileArchipelago, shellArchipelago, ALL_FIXTURES, ALL_ROLES, ALL_SCENARIOS, ALL_FLOWS } from 'demo-app';
import { eventsRegion, homeRegion, SIGNED_IN } from './regions/club.js';
// EXPERIMENTAL: the app's screens — its own layout with a region in each part (`src/screens/screens.ts`).
import { SCREENS } from 'demo-app/screens';
// The profile region's own evidence rows — the member and calendar its flows already speak — rather
// than a fourth copy of the vocabulary written for the gallery.
import { DENNIS, OPEN_CALENDAR } from 'demo-app/evidence/profile';
import { CLUB, EVIDENCE_DAY } from 'demo-app/evidence/club';
import 'demo-app/fonts';
import css from 'demo-app/styles.css?inline';
import config from '../lagoon.config.json';
import { setupLagoonAngularHost } from './angular-host.js';
// Ambient ocean cascade (lagoon-only): the host's typography/palette + the --x-* token contract, so
// light islands inherit the ocean look offline exactly as they would embedded. Injected early so
// island styles still win.
import './ocean.css';

// Build default for the transport, injected by vite.config from the MOTU_TRANSPORT env var. Empty
// string means "unset" → mock, which is every build a person opens; `motu fixtures record --transport
// http` is the only one that sets it, and it writes fixtures rather than showing anyone a page.
declare const __MOTU_TRANSPORT__: string;
// Present in the lagoon by default (the sandbox); MOTU_DEBUG=0 strips it.
declare const __MOTU_DEBUG__: boolean;
// Project-wide default isolation, injected from motu.config.json by vite.
declare const __MOTU_ISOLATION__: 'shadow' | 'light';
declare const __MOTU_LEGACY_FIT__: boolean;

// BEFORE anything mounts, so the lagoon previews the project's real isolation posture.
setDefaultIsolation(__MOTU_ISOLATION__);

const host: HostBridge = {
  navigate: (path) => {
    console.log('[host] navigate', path);
    window.location.hash = path.startsWith('/') ? '#' + path : '#/' + path;
  },
  action: (name, detail) => {
    console.log('[host] action', name, detail);
  },
};

// Authored per-mountpoint frames (lagoon-only): the stand-in geometry for each slot's distinct ocean
// callsite. Authored files AND `motu archipelago record-frame` output both live in src/frames/*.css;
// the bridge never ships them, because in the ocean the real callsite provides the container.
const frames = import.meta.glob('./frames/*.css', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>;

startLagoon({
  elements: ELEMENT_REGISTRY,
  screens: SCREENS,
  archipelagos: ARCHIPELAGOS,
  fixtures: ALL_FIXTURES,
  roles: ALL_ROLES,
  // The declared states, so `?target=island:<tag>&scenario=<name>` is an ADDRESS here too. This entry
  // is EJECTED — the project owns it and motu will not regenerate it — so a capability added to the
  // scaffold after the eject reaches this app only by being added here. That is exactly what had
  // happened: the framework's own demo could not open a state the framework advertises.
  evidence: { scenarios: ALL_SCENARIOS, flows: ALL_FLOWS },
  css,
  config,
  frames,
  isolation: __MOTU_ISOLATION__,
  // EJECTED ENTRY: the scaffold gained this, so it only arrives here by hand.
  legacyFit: __MOTU_LEGACY_FIT__,
  transport: typeof __MOTU_TRANSPORT__ === 'string' ? __MOTU_TRANSPORT__ : '',
  debug: __MOTU_DEBUG__,
  overrides: {
    host,
    // Stands up a fake AngularJS host so the extracted member-search island renders offline. It was a
    // top-level call; `setup` is the declared point for it and runs in BOTH views rather than only
    // whichever happened to import this module first.
    setup: setupLagoonAngularHost,
    /**
     * HTTP is the only mode this project builds itself, and `motu fixtures record --transport http`
     * is the only thing that asks for it.
     *
     * The real backend sits behind the dev proxy and wants this project's own XSRF cookie and header
     * names, which `httpBase` alone cannot say. Mock is deliberately left to the default: the lagoon
     * has to work offline, and every island already owns its fixtures.
     */
    transportFor: (mode: TransportMode) =>
      mode === 'http'
        ? new HttpTransport('/api/rest/motu', {
            xsrfCookieName: 'M-XSRF-TOKEN',
            xsrfHeaderName: 'X-M-XSRF-TOKEN',
          })
        : undefined,
    // PER REGION, and only where it is meant. Only `members` has a search island reading
    // `searchConfig`, so only it gets that channel — wiring it to the others would show up in the
    // lens as channels nothing reads, which is a finding rather than a configuration.
    regions: [
      // THE CLUB ON THE EVIDENCE DAY: the app's own rules over the seed (`club-evidence.ts`), not a
      // drawing of a leaderboard. The Filters popover that read `searchConfig` left this region with
      // the redesign, and its channel with it.
      overridesFor(membersArchipelago(), {
        seed: { criteria: {}, overview: CLUB, asOf: EVIDENCE_DAY, dataSource: 'sandbox', selectedMember: null, resultCount: null },
      }),
      overridesFor(usersArchipelago, { seed: { criteria: {} } }),
      // THE SHELL, as the sandbox build opens it: in the directory, on the committed seed, signed in as
      // the first persona — what a first visit to the app looks like.
      overridesFor(shellArchipelago, { seed: { section: 'directory', dataSource: 'sandbox', me: SIGNED_IN } }),
      // THE EVENTS PAGE and MY CLUB: the app's own events source over the seed (`regions/club.ts`,
      // shared with the focused entry the checks drive).
      eventsRegion,
      homeRegion,
      // THE PROFILE, opened on a member who has been resolved.
      //
      // The page's resting state (`member: null`) is the hero's "Select a member" and has its own
      // address as the first step of `each built slot renders its own island`. The state worth OPENING
      // on is the one a person sees after clicking a row: hero, card and availability for one member.
      // `selectedDay` / `selectedSlot` belong to the planned calendar islands and stay null — seeding
      // them would claim a choice no island has made.
      overridesFor(profileArchipelago, {
        seed: {
          member: DENNIS,
          calendar: OPEN_CALENDAR,
          asOf: EVIDENCE_DAY,
          selectedDay: null,
          selectedSlot: null,
        },
        // The page passes `loading` on the hero; in the gallery the member is already resolved.
        props: { 'profile-hero': { loading: false } },
      }),
    ],
  },
  // The seam lens, handed in rather than imported: @motu/react must not depend on the dev-only
  // package, and __MOTU_DEBUG__ strips both the overlay and this wiring together.
  lens: __MOTU_DEBUG__
    ? {
        mount: mountDebugOverlay,
        toggle: toggleDebugOverlay,
        isOpen: isDebugOverlayOpen,
        subscribe: subscribeDebugOverlay,
        mountFindings,
        findings: currentFindings,
        sheet: currentSheet,
        seams: currentSeams,
        islands: currentIslands,
        coupling: currentCoupling,
        coverage: currentCoverage,
        toggleRecording,
        recordingState,
        setPicking,
        // EJECTED ENTRY: a capability added to the scaffold reaches this app only by being added
        // here — which is how this file came to be missing `evidence` too.
        onPicked: onIslandPicked,
        setCoupling,
        couplingOn,
        watch: watchSeams,
      }
    : undefined,
});
