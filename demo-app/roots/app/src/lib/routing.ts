// Navigation, in about sixty lines and with no router library.
//
// WHY NOT `react-router`. Two reasons, and the second is the one that decides it.
//
// The small one: this app has a handful of screens and two parameters. A router would be more code than it
// removes, which is the same judgement the tab bar already made before there was a profile page.
//
// The one that matters: a `<Router>` CANNOT NEST. The lagoon installs an island's `providers` for
// every view — once for the frame's own chrome and once per island — so anything in that list is
// mounted more than once, and React Router throws when it is. That failure is invisible in the
// region view and fatal in the mountpoints view, which is the view the flow checks drive, so it
// reads as "the region rendered nothing" rather than "your router nested". The gate for the ones
// that cannot nest is `useInRouterContext()`; the way to not need a gate is to not need a router.
//
// So the app owns its URL directly. `history.pushState` plus a `popstate` listener is the whole
// mechanism, islands never see any of it, and the region's outward seam stays what motu says it is:
// a `HostBridge` with a `navigate`, supplied by the composition root.
import { useCallback, useEffect, useState } from 'react';
import type { HostBridge } from '@motu/core';
import { signInAs } from './session.js';

/** Where the app can be. `profile` and `chapter` carry a parameter. */
export type Route =
  | { name: 'home' }
  | { name: 'members' }
  | { name: 'users' }
  | { name: 'events' }
  | { name: 'chapters' }
  | { name: 'chapter'; slug: string }
  | { name: 'profile'; memberId: string };

/**
 * A path into a route.
 *
 * UNKNOWN PATHS FALL BACK TO THE DIRECTORY rather than rendering an error screen. This is a demo
 * with a handful of addresses; a 404 page would be one more screen that exists only to be wrong at.
 */
export function routeFrom(pathname: string): Route {
  const member = /^\/member\/([^/?#]+)/.exec(pathname);
  if (member) return { name: 'profile', memberId: decodeURIComponent(member[1]!) };
  const chapter = /^\/chapters\/([^/?#]+)/.exec(pathname);
  if (chapter) return { name: 'chapter', slug: decodeURIComponent(chapter[1]!) };
  if (pathname.startsWith('/chapters')) return { name: 'chapters' };
  if (pathname.startsWith('/events')) return { name: 'events' };
  // EXACT: `/member/<id>` also starts with `/me`, and it is matched above — but nothing should depend on that order.
  if (pathname === '/me' || pathname.startsWith('/me/')) return { name: 'home' };
  if (pathname.startsWith('/add')) return { name: 'users' };
  return { name: 'members' };
}

/** The path for a route — the inverse of `routeFrom`, kept beside it so the two cannot drift. */
export function pathFor(route: Route): string {
  switch (route.name) {
    case 'profile':
      return `/member/${encodeURIComponent(route.memberId)}`;
    case 'users':
      return '/add';
    case 'home':
      return '/me';
    case 'events':
      return '/events';
    case 'chapters':
      return '/chapters';
    case 'chapter':
      return `/chapters/${encodeURIComponent(route.slug)}`;
    default:
      return '/';
  }
}

/** Push a path and tell the app about it. Exported so a non-React caller can navigate too. */
export function navigate(path: string): void {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState({}, '', path);
  // `pushState` deliberately does NOT fire `popstate` — that event is the BACK button. Without this
  // the URL changes and the screen does not, which looks like a dead link and is the single most
  // common bug in a hand-rolled router.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** The current route, re-read whenever the history moves (including the back button). */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFrom(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(routeFrom(window.location.pathname));
    window.addEventListener('popstate', onPop);
    // Re-read on mount too: a deep link opened in a new tab has a path before any event fires.
    onPop();
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

/**
 * The region's outward seam.
 *
 * A HOOK, because `createRegion` is called at module scope where hooks cannot run — so the binding
 * takes a `useHost` and calls it inside the provider.
 *
 * ONE ACTION IS THE APP'S: `switch-member`, the sidebar asking to act as someone else — answered by
 * the session, because who is signed in belongs to no region. Intents a declared SOURCE answers (an
 * RSVP) never reach here; motu routes those to the source. Anything else says so rather than silently
 * swallowing an intent nobody wired.
 */
export function useHostBridge(): HostBridge {
  const nav = useCallback((path: string) => navigate(path), []);
  return {
    navigate: nav,
    action: (name: string, detail?: unknown) => {
      if (name === 'switch-member') {
        signInAs(typeof detail === 'string' && detail !== '' ? detail : null);
        return;
      }
      console.warn(`demo-app: no handler for host action "${name}"`);
    },
  };
}
