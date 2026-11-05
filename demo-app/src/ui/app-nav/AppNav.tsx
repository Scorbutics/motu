import type { MotuFit } from '@motu/core';

/** The app's sections, in the order the bar shows them. A profile belongs to the directory. */
export const APP_SECTIONS = [
  { id: 'directory', label: 'Directory', hint: 'Browse the members' },
  { id: 'add', label: 'Add a member', hint: 'Create a new member' },
] as const;

export type AppSection = (typeof APP_SECTIONS)[number]['id'];

/**
 * Where the members on screen come from. Both are this app's own builds: `live` is the local Postgres
 * behind Supabase, `sandbox` is the static build that answers the same ports in the browser from the
 * committed seed (`roots/app/src/lib/browser-port.ts`).
 */
export type DataSource = 'sandbox' | 'live';

export interface AppNavProps {
  /** The section the page is in. Unknown or absent lights nothing rather than guessing. */
  section?: AppSection;
  /** Which backend answers the page. Absent reads as the sandbox, the build anyone can open. */
  dataSource?: DataSource;
  /** A section was picked. A navigation INTENT — the region decides which URL that is. */
  onNavigate?: (section: AppSection) => void;
  /** Injected footprint, for the fit axis. CSS-only island: accepted and unused. */
  fit?: MotuFit;
}

/** The product mark, drawn as the member card draws it — one brand, not two. */
function Mark() {
  return (
    <span className="an__mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    </span>
  );
}

/**
 * The site's navigation bar.
 *
 * SHARED BY EVERY PAGE, so it lives in its own region at the app root rather than inside any page's:
 * a page region mounts and unmounts with its route, and a bar that remounted on every click would
 * flash. It reads two host-fed keys and writes none — picking a section is an effect (the region
 * turns it into a URL), not region state.
 *
 * Every input is optional: from defaults alone it renders the brand, both sections with none lit,
 * and the sandbox badge — which is the state of a page whose route has not been read yet.
 */
export function AppNav({ section, dataSource = 'sandbox', onNavigate, fit }: AppNavProps) {
  void fit;
  const live = dataSource === 'live';
  return (
    <header className="an">
      <div className="an__inner">
        <a
          className="an__brand"
          href="/"
          onClick={(e) => {
            if (!onNavigate) return;
            e.preventDefault();
            onNavigate('directory');
          }}
        >
          <Mark />
          <span className="an__name">
            motu <span className="an__name-soft">demo-app</span>
          </span>
        </a>

        <nav className="an__links" aria-label="Sections">
          {APP_SECTIONS.map((s) => {
            const on = s.id === section;
            return (
              <button
                key={s.id}
                type="button"
                className={`an__link${on ? ' an__link--on' : ''}`}
                aria-current={on ? 'page' : undefined}
                title={s.hint}
                onClick={() => onNavigate?.(s.id)}
              >
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* WHERE THE DATA COMES FROM, said once and in the chrome. A demo that runs against a real
            database in one build and the committed seed in another should never leave a viewer
            guessing which one they are looking at. */}
        <span className={`an__source an__source--${live ? 'live' : 'sandbox'}`} title={live ? 'Local Postgres via Supabase' : 'Seed data, answered in the browser'}>
          <span className="an__source-dot" aria-hidden="true" />
          {live ? 'Live data' : 'Sandbox data'}
        </span>
      </div>
    </header>
  );
}
