// The club's screens beside one sidebar, on the club's paper, over the app's own URL.
//
// WHAT MATTERS HERE IS THAT NO PAGE KNOWS ABOUT ANOTHER, and none of them holds any region state.
// Each mounts its own region; changing route unmounts one and mounts the next. The profile is the
// only screen with a parameter, and it takes it as a prop — so the page is a function of the route
// rather than a component that reads the URL from underneath itself.
//
// TWO KINDS OF PAGE LIVE HERE, on purpose. Most are motu regions. The chapter pages are not: they are
// the app's older code — a fetch in an effect, a `useState` per thing — the shape every app that
// adopts motu already has a lot of, and the shape adoption starts from.
//
// THE BAR IS THE SHELL REGION, and it is the one region that does NOT change with the route. It wraps
// the whole app; each page's region renders inside it with a provider of its own, and nothing in a
// page reads the shell. What the shell needs from here is two facts — which section the URL is in,
// and which backend this build talks to — and it is handed both as host-fed keys.
//
// WHO YOU ARE is the app's session (`lib/session.ts`), read once here and fed to the shell and to the
// pages that need it. The sidebar's switcher asks the host for a change; it never holds the answer.
//
// The URL is handled in `lib/routing.ts`, in about sixty lines, with no router library. That file
// says why at length; the short version is that a `<Router>` cannot nest, and the lagoon installs an
// island's providers once per view PLUS once per island.
import { useEffect, useRef } from 'react';
import type { AppSection } from 'demo-app';
import { MembersPage } from './pages/MembersPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { EventsPage } from './pages/EventsPage.js';
import { HomePage } from './pages/HomePage.js';
import { ChaptersPage } from './pages/ChaptersPage.js';
import { ChapterPage } from './pages/ChapterPage.js';
import { useRoute, type Route } from './lib/routing.js';
import { useSignedIn } from './lib/session.js';
import type { MemberRow } from 'demo-app';
import { IN_BROWSER_DATA } from './lib/app-data.js';
import { Shell } from './motu/shell-region.js';

/**
 * The section a route belongs to. A PROFILE IS PART OF THE DIRECTORY: it is reached from a row in
 * that list, so lighting nothing would make the profile look like a screen with no home.
 */
function sectionOf(route: Route): AppSection {
  switch (route.name) {
    case 'users':
      return 'add';
    case 'home':
      return 'home';
    case 'events':
      return 'events';
    case 'chapters':
    case 'chapter':
      return 'chapters';
    default:
      return 'directory';
  }
}

/** Feeds the shell its three keys. Inside the provider, because `provide` reaches the nearest region. */
function ShellFeed({ route, me }: { route: Route; me: MemberRow | null }) {
  const section = sectionOf(route);
  useEffect(() => {
    Shell.provide('section', section);
    Shell.provide('dataSource', IN_BROWSER_DATA ? 'sandbox' : 'live');
  }, [section]);
  useEffect(() => {
    Shell.provide('me', me);
  }, [me]);
  return null;
}

/** The browser tab's title, read back from the shell — it said "Members" on every page before. */
const TITLES: Record<string, string> = { home: 'My club', directory: 'Members', chapters: 'Chapters', events: 'Events', add: 'Add a member' };
function ShellTitle() {
  const region = Shell.useRegion();
  const title = typeof region.section === 'string' ? TITLES[region.section] : undefined;
  useEffect(() => {
    document.title = title ? `${title} · The Motu's club` : "The Motu's club";
  }, [title]);
  return null;
}

export function App() {
  const route = useRoute();
  // `undefined` while the session resolves: the shell keeps showing whoever it showed, rather than
  // flashing "Guest" for a frame on every reload.
  const resolved = useSignedIn();
  const shown = useRef<MemberRow | null>(null);
  if (resolved !== undefined) shown.current = resolved;
  const me = shown.current;
  return (
    <Shell.Region>
      <ShellFeed route={route} me={me} />
      <ShellTitle />
      {/* THE CLUB'S SHEET: aged paper, the sidebar beside every page. The frame carries the skin marker
          the island tokens resolve against (`--cl-*`, `--mc-*`), so every page inherits them. */}
      <div className="app__frame cl-paper motu-root" data-motu-theme="motu">
        <div className="app__sheet cl-sheet cl-aged">
          <div className="app__side">
            <Shell.Island slot="app-nav" />
          </div>
          <div className="app__main">
      {route.name === 'profile' ? (
        // KEYED BY THE MEMBER ID. Without this, clicking a second member reuses the mounted page and
        // its region keeps the first member's store — the hero swaps and the calendar does not,
        // which reads as a stale calendar rather than a remount that never happened.
        <ProfilePage key={route.memberId} memberId={route.memberId} />
      ) : route.name === 'users' ? (
        <UsersPage />
      ) : route.name === 'home' ? (
        <HomePage me={resolved} />
      ) : route.name === 'events' ? (
        <EventsPage me={resolved} />
      ) : route.name === 'chapters' ? (
        <ChaptersPage />
      ) : route.name === 'chapter' ? (
        <ChapterPage key={route.slug} slug={route.slug} />
      ) : (
        <MembersPage />
      )}
          </div>
        </div>
      </div>
    </Shell.Region>
  );
}
