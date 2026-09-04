// Two pages and a tab bar. No router: this app has two screens and adding one would be more code
// than it removes.
//
// WHAT MATTERS HERE IS THAT NEITHER PAGE KNOWS ABOUT THE OTHER, and neither holds any region state.
// Each mounts its own region; switching tabs unmounts one and mounts the other.
import { useState } from 'react';
import { MembersPage } from './pages/MembersPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { OrgPage } from './pages/OrgPage.js';

const TABS = [
  { id: 'members', label: 'Directory' },
  { id: 'users', label: 'Add a member' },
  { id: 'org', label: 'Org lookup' },
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('members');
  return (
    <>
      <nav className="app__nav" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`app__tab${tab === t.id ? ' app__tab--on' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'members' ? <MembersPage /> : tab === 'users' ? <UsersPage /> : <OrgPage />}
    </>
  );
}
