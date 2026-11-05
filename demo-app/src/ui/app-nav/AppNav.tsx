import type { MotuFit } from '@motu/core';
import { PeopleIcon } from '../club/club-bits.js';

/** The app's sections that exist, in the order the sidebar shows them. A profile belongs to the directory. */
export const APP_SECTIONS = [
  { id: 'directory', label: 'Members', hint: 'Browse the members' },
  { id: 'add', label: 'Add a member', hint: 'Create a new member' },
] as const;

export type AppSection = (typeof APP_SECTIONS)[number]['id'];

/**
 * Where the members on screen come from. Both are this app's own builds: `live` is the local Postgres
 * behind Supabase, `sandbox` is the static build that answers the same ports in the browser from the
 * committed seed (`roots/app/src/lib/browser-port.ts`).
 */
export type DataSource = 'sandbox' | 'live';

/**
 * WHAT THE DESIGN NAMES AND THIS DEMO HAS NOT BUILT. Drawn — the sidebar is the club's map, and its
 * shape is part of the design — but as plain text marked "soon", never as links: a link to a screen
 * that does not exist is what the Paste button was, and it led to "No such member".
 */
const PLANNED_SECTIONS = ['Chapters', 'Quests', 'Leaderboard', 'Events', 'Rewards', 'Settings'];
const ADMIN_TOOLS = ['Import members', 'Export list', 'Invite links', 'Plans & billing'];
const SEE_ALSO = ['Help centre', "What's new"];

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

/** The club's own name in the sidebar's badge. */
const CLUB_NAME = 'motu club';

function Soon({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name) => (
        <span key={name} className="cl-side__soon">
          {name} <em>soon</em>
        </span>
      ))}
    </>
  );
}

/**
 * The site's sidebar, shared by every page.
 *
 * It lives in its own region at the app root rather than inside any page's: a page region mounts and
 * unmounts with its route, and a sidebar that remounted on every click would flash. It reads two
 * host-fed keys and writes none — picking a section is an effect the region turns into a URL.
 *
 * At phone width the extras fold away and the sections run in a row, as the design does it.
 *
 * Every input is optional: from defaults alone it renders the club's badge, every section with none
 * lit, and the sandbox line — the state of a page whose route has not been read yet.
 */
export function AppNav({ section, dataSource = 'sandbox', onNavigate, fit }: AppNavProps) {
  void fit;
  const live = dataSource === 'live';
  return (
    <nav className="cl-side cl-aged" aria-label="Main">
      <a
        className="cl-side__brand"
        href="/"
        onClick={(e) => {
          if (!onNavigate) return;
          e.preventDefault();
          onNavigate('directory');
        }}
      >
        <span className="cl-side__badge">
          <PeopleIcon size={26} stroke="var(--cl-goldink)" width={2.4} />
        </span>
        <span className="cl-lg cl-side__name">{CLUB_NAME}</span>
      </a>

      <div>
        <div className="cl-side__kick cl-side__extra">Sections</div>
        <div className="cl-side__list cl-side__list--sections">
          {APP_SECTIONS.map((s) => {
            const on = s.id === section;
            return (
              <button
                key={s.id}
                type="button"
                className={`cl-side__link${on ? ' cl-side__link--on' : ''}`}
                aria-current={on ? 'page' : undefined}
                title={s.hint}
                onClick={() => onNavigate?.(s.id)}
              >
                {s.label}
              </button>
            );
          })}
          <Soon names={PLANNED_SECTIONS} />
        </div>
      </div>

      <div className="cl-side__extra">
        <div className="cl-side__kick">Admin tools</div>
        <div className="cl-side__list">
          <Soon names={ADMIN_TOOLS} />
        </div>
      </div>

      <div className="cl-side__extra">
        <div className="cl-side__kick">See also</div>
        <div className="cl-side__list">
          <Soon names={SEE_ALSO} />
        </div>
      </div>

      {/* SIGNED IN AS A GUEST, because this demo has no sign-in: every visitor reads the directory as
          the same anonymous user, and saying so is truer than the design's [admin name]. And which
          backend answers, said once, at the foot of every page. */}
      <div className="cl-side__foot cl-side__extra">
        <span>
          Signed in as <strong>Guest</strong>
        </span>
        <span title={live ? 'Local Postgres via Supabase' : 'Seed data, answered in the browser'}>
          Data: <strong>{live ? 'live database' : 'sandbox seed'}</strong>
        </span>
      </div>
    </nav>
  );
}
