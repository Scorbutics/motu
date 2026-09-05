// Four screens and a tab bar, over the app's own URL.
//
// WHAT MATTERS HERE IS THAT NO PAGE KNOWS ABOUT ANOTHER, and none of them holds any region state.
// Each mounts its own region; changing route unmounts one and mounts the next. The profile is the
// only screen with a parameter, and it takes it as a prop — so the page is a function of the route
// rather than a component that reads the URL from underneath itself.
//
// The URL is handled in `lib/routing.ts`, in about sixty lines, with no router library. That file
// says why at length; the short version is that a `<Router>` cannot nest, and the lagoon installs an
// island's providers once per view PLUS once per island.
import { MembersPage } from './pages/MembersPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { OrgPage } from './pages/OrgPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { navigate, useRoute, type Route } from './lib/routing.js';

const TABS: { route: Route; label: string }[] = [
  { route: { name: 'members' }, label: 'Directory' },
  { route: { name: 'users' }, label: 'Add a member' },
  { route: { name: 'org' }, label: 'Org lookup' },
];

const PATHS: Record<string, string> = { members: '/', users: '/add', org: '/org' };

export function App() {
  const route = useRoute();
  return (
    <>
      <nav className="app__nav" aria-label="Sections">
        {TABS.map((t) => {
          // A PROFILE KEEPS THE DIRECTORY TAB LIT. It is reached from a row in that list, so
          // un-highlighting every tab would make the profile look like a screen with no home.
          const on = route.name === t.route.name || (route.name === 'profile' && t.route.name === 'members');
          return (
            <button
              key={t.route.name}
              type="button"
              className={`app__tab${on ? ' app__tab--on' : ''}`}
              aria-current={on ? 'page' : undefined}
              onClick={() => navigate(PATHS[t.route.name]!)}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      {route.name === 'profile' ? (
        // KEYED BY THE MEMBER ID. Without this, clicking a second member reuses the mounted page and
        // its region keeps the first member's store — the hero swaps and the calendar does not,
        // which reads as a stale calendar rather than a remount that never happened.
        <ProfilePage key={route.memberId} memberId={route.memberId} />
      ) : route.name === 'users' ? (
        <UsersPage />
      ) : route.name === 'org' ? (
        <OrgPage />
      ) : (
        <MembersPage />
      )}
    </>
  );
}
