// THE CLUB'S SCREENS — what the app looks like at each address: its own layout (`AppFrame`), the
// shell region in the sidebar, and one region (or a page not yet islanded) beside it. EXPERIMENTAL.
//
// A screen ARRANGES; it holds no state. Every region below is mounted exactly as it is at its own
// station, with its own store and its own checks. What a screen adds is only what the APP gives each
// region at that address — the `host` values the pages' own code `provide`s: which section the URL is
// in, who is signed in, the member a profile URL names. Taken from the evidence the regions already
// speak (the first persona, the club on the evidence day), never written here.
//
// Navigation follows these routes: a region's `host.navigate('/events')` opens the Events screen; a
// path no screen declares is refused out loud, and `motu check` refuses it before anything runs.
import { screen, notARegion, worldFact, type ScreenConfig } from '@motu/react';
import { AppFrame } from '../ui/app-frame/AppFrame.js';
import { shellArchipelago } from '../archipelagos/shell/shell.archipelago.js';
import { membersArchipelago } from '../archipelagos/members/members.archipelago.js';
import { profileArchipelago } from '../archipelagos/profile/profile.archipelago.js';
import { usersArchipelago } from '../archipelagos/users/users.archipelago.js';
import { eventsArchipelago } from '../archipelagos/events/events.archipelago.js';
import { homeArchipelago } from '../archipelagos/home/home.archipelago.js';
import { calendarFrom } from '../shared/availability-source.js';
import { seedTimeslots } from '../shared/seed-timeslots.js';
import { SEED_MEMBERS } from '../shared/seed-members.generated.js';
import { CLUB, EVIDENCE_DAY } from '../shared/club-evidence.js';
import { DENNIS as SIGNED_IN } from '../shared/events-evidence.js';
import type { AppSection } from '../ui/app-nav/AppNav.js';

const layout = AppFrame as unknown as ScreenConfig['layout'];
const members = membersArchipelago();

/** What the app feeds the shell on every screen: where you are, which build, who you are. */
/**
 * Who is signed in: Dennis, unless a lagoon WORLD says otherwise (`karen-signed-in`). A fact, read when
 * a screen opens; in the app no world is installed and this is always Dennis.
 */
const signedIn = () => worldFact('signedIn', SIGNED_IN);

const shell = (section: AppSection) => ({ [shellArchipelago.id]: { section, dataSource: 'sandbox', me: signedIn() } });

export const SCREENS: ScreenConfig[] = [
  screen({
    id: 'home',
    label: 'My club',
    path: '/me',
    layout,
    slots: { sidebar: shellArchipelago, main: homeArchipelago },
    host: () => ({ ...shell('home'), home: { me: signedIn(), asOf: EVIDENCE_DAY, overview: CLUB } }),
  }),
  screen({
    id: 'directory',
    label: 'Members',
    path: '/',
    layout,
    slots: { sidebar: shellArchipelago, main: members },
    host: () => shell('directory'),
  }),
  screen({
    id: 'member',
    label: 'Member profile',
    path: '/member/:memberId',
    // The evidence member: premium, with availability — what a click from the directory opens most.
    example: `/member/${String(SIGNED_IN.id)}`,
    layout,
    slots: { sidebar: shellArchipelago, main: profileArchipelago },
    // THE MEMBER THE URL NAMES, and that member's calendar by the seed's own rules — so a click on
    // ANY row opens that member, not a fixed one. An id the seed does not hold resolves to `null`,
    // which the hero renders as the page's own "Select a member" state.
    host: ({ params }) => {
      const member = SEED_MEMBERS.find((m) => m.id === params.memberId) ?? null;
      const calendar = member ? calendarFrom(String(member.id), seedTimeslots(member, EVIDENCE_DAY)) : null;
      return { ...shell('directory'), profile: { member, calendar, asOf: EVIDENCE_DAY } };
    },
  }),
  screen({
    id: 'events',
    label: 'Events',
    path: '/events',
    layout,
    slots: { sidebar: shellArchipelago, main: eventsArchipelago },
    host: () => ({ ...shell('events'), events: { me: signedIn() } }),
  }),
  screen({
    id: 'chapters',
    label: 'Chapters',
    path: '/chapters',
    layout,
    slots: {
      sidebar: shellArchipelago,
      main: notARegion('ChaptersPage.tsx is plain React — its own fetches and useState — and has no region yet. Survey it (/island-locate) before islanding it.'),
    },
    host: () => shell('chapters'),
  }),
  screen({
    id: 'chapter',
    label: 'One chapter',
    path: '/chapters/:slug',
    example: '/chapters/north',
    layout,
    slots: {
      sidebar: shellArchipelago,
      main: notARegion('ChapterPage.tsx is plain React, with its own member table beside the directory’s x-member-results — the decision to reuse that island is about two pages, so it waits for a survey.'),
    },
    host: () => shell('chapters'),
  }),
  screen({
    id: 'add',
    label: 'Add a member',
    path: '/add',
    layout,
    slots: { sidebar: shellArchipelago, main: usersArchipelago },
    host: () => shell('add'),
  }),
];
