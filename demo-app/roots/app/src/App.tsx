// Three screens under one navigation bar, over the app's own URL.
//
// WHAT MATTERS HERE IS THAT NO PAGE KNOWS ABOUT ANOTHER, and none of them holds any region state.
// Each mounts its own region; changing route unmounts one and mounts the next. The profile is the
// only screen with a parameter, and it takes it as a prop — so the page is a function of the route
// rather than a component that reads the URL from underneath itself.
//
// THE BAR IS THE SHELL REGION, and it is the one region that does NOT change with the route. It wraps
// the whole app; each page's region renders inside it with a provider of its own, and nothing in a
// page reads the shell. What the shell needs from here is two facts — which section the URL is in,
// and which backend this build talks to — and it is handed both as host-fed keys.
//
// The URL is handled in `lib/routing.ts`, in about sixty lines, with no router library. That file
// says why at length; the short version is that a `<Router>` cannot nest, and the lagoon installs an
// island's providers once per view PLUS once per island.
import { useEffect } from 'react';
import type { AppSection } from 'demo-app';
import { MembersPage } from './pages/MembersPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { useRoute, type Route } from './lib/routing.js';
import { IN_BROWSER_DATA } from './lib/app-data.js';
import { Shell } from './motu/shell-region.js';

/**
 * The section a route belongs to. A PROFILE IS PART OF THE DIRECTORY: it is reached from a row in
 * that list, so lighting nothing would make the profile look like a screen with no home.
 */
function sectionOf(route: Route): AppSection {
  return route.name === 'users' ? 'add' : 'directory';
}

/** Feeds the shell its two keys. Inside the provider, because `provide` reaches the nearest region. */
function ShellFeed({ route }: { route: Route }) {
  const section = sectionOf(route);
  useEffect(() => {
    Shell.provide('section', section);
    Shell.provide('dataSource', IN_BROWSER_DATA ? 'sandbox' : 'live');
  }, [section]);
  return null;
}

/** The browser tab's title, read back from the shell — it said "Members" on every page before. */
const TITLES: Record<string, string> = { directory: 'Directory', add: 'Add a member' };
function ShellTitle() {
  const region = Shell.useRegion();
  const title = typeof region.section === 'string' ? TITLES[region.section] : undefined;
  useEffect(() => {
    document.title = title ? `${title} · motu demo` : 'motu demo';
  }, [title]);
  return null;
}

export function App() {
  const route = useRoute();
  return (
    <Shell.Region>
      <ShellFeed route={route} />
      <ShellTitle />
      {/* The bar carries the skin marker the island tokens resolve against — see MembersPage. */}
      <div className="motu-root app__shell" data-motu-theme="motu">
        <Shell.Island slot="app-nav" />
      </div>
      {route.name === 'profile' ? (
        // KEYED BY THE MEMBER ID. Without this, clicking a second member reuses the mounted page and
        // its region keeps the first member's store — the hero swaps and the calendar does not,
        // which reads as a stale calendar rather than a remount that never happened.
        <ProfilePage key={route.memberId} memberId={route.memberId} />
      ) : route.name === 'users' ? (
        <UsersPage />
      ) : (
        <MembersPage />
      )}
    </Shell.Region>
  );
}
