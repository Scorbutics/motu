import { useEffect, useRef, useState } from 'react';
import type { MotuFit } from '@motujs/core';
import { CLUB_NAME, PeopleIcon, initials } from '../club/club-bits.js';
import { firstString, type MemberRow } from '../../shared/member-types.js';
import { PERSONAS } from '../../shared/personas.js';

/** The app's sections that exist, in the order the sidebar shows them. A profile belongs to the directory. */
export const APP_SECTIONS = [
  { id: 'home', label: 'My club', hint: 'Your level, your events, your chapter' },
  { id: 'directory', label: 'Members', hint: 'Browse the members' },
  { id: 'chapters', label: 'Chapters', hint: 'The eight local chapters' },
  { id: 'events', label: 'Events', hint: 'What is on, and who is going' },
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
const PLANNED_SECTIONS = ['Quests', 'Leaderboard', 'Rewards', 'Settings'];
const ADMIN_TOOLS = ['Import members', 'Export list', 'Invite links', 'Plans & billing'];
const SEE_ALSO = ['Help centre', "What's new"];

export interface AppNavProps {
  /** The section the page is in. Unknown or absent lights nothing rather than guessing. */
  section?: AppSection;
  /** Which backend answers the page. Absent reads as the sandbox, the build anyone can open. */
  dataSource?: DataSource;
  /** Who the app is acting as. Absent or null is a guest. */
  me?: MemberRow | null;
  /** A section was picked. A navigation INTENT — the region decides which URL that is. */
  onNavigate?: (section: AppSection) => void;
  /**
   * Act as another member (an id), or as a guest (null). An INTENT: who is signed in is the app's
   * session, not this bar's — the bar asks, and the change comes back as `me`.
   */
  onSwitchMember?: (memberId: string | null) => void;
  /** Injected footprint, for the fit axis. CSS-only island: accepted and unused. */
  fit?: MotuFit;
}

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
 * Who you are, and the way to be someone else.
 *
 * LABELLED AS WHAT IT IS. This club has no login, so the switcher says "demo — no password" inside the
 * menu: a picker that looked like an account menu would be claiming an auth system nobody built.
 */
function SignedInAs({ me, onSwitchMember }: { me: MemberRow | null; onSwitchMember?: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = firstString(me ?? {}, ['firstname']) ?? '';
  const last = firstString(me ?? {}, ['surname']) ?? '';
  const name = me ? `${first} ${last}`.trim() : 'Guest';
  const meId = me ? firstString(me, ['id']) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: string | null) => {
    setOpen(false);
    onSwitchMember?.(id);
  };

  return (
    <div className="cl-side__me" ref={root}>
      <span className={`cl-side__ava${me ? '' : ' cl-side__ava--guest'}`} aria-hidden="true">
        {me ? initials(first, last) : '?'}
      </span>
      <span className="cl-side__who">
        <span className="cl-side__as">Signed in as</span>
        <strong>{name}</strong>
      </span>
      {onSwitchMember ? (
        <button type="button" className="cl-side__switch" aria-expanded={open} aria-controls="cl-side-personas" onClick={() => setOpen((o) => !o)}>
          Switch
        </button>
      ) : null}
      {open ? (
        <div className="cl-side__menu" id="cl-side-personas">
          <p className="cl-side__menu-note">Act as a member — demo, no password</p>
          {PERSONAS.map((p) => (
            <button key={p.id} type="button" className="cl-side__persona" aria-pressed={p.id === meId} onClick={() => pick(p.id)}>
              <strong>{p.name}</strong>
              <span>{p.note}</span>
            </button>
          ))}
          <button type="button" className="cl-side__persona" aria-pressed={!me} onClick={() => pick(null)}>
            <strong>Browse as a guest</strong>
            <span>See the club without being a member</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The site's sidebar, shared by every page.
 *
 * It lives in its own region at the app root rather than inside any page's: a page region mounts and
 * unmounts with its route, and a sidebar that remounted on every click would flash. It reads three
 * host-fed keys and writes none — picking a section, or a persona, is an intent the region hands on.
 *
 * At phone width the extras fold away and the sections run in a row, as the design does it. Who you
 * are stays: it is the one thing in the bar every page's content depends on.
 *
 * Every input is optional: from defaults alone it renders the club's badge, every section with none
 * lit, a guest, and the sandbox line — the state of a page whose route has not been read yet.
 */
export function AppNav({ section, dataSource = 'sandbox', me = null, onNavigate, onSwitchMember, fit }: AppNavProps) {
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

      <SignedInAs me={me} onSwitchMember={onSwitchMember} />

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

      {/* Which backend answers, said once, at the foot of every page. */}
      <div className="cl-side__foot cl-side__extra">
        <span title={live ? 'Local Postgres via Supabase' : 'Seed data, answered in the browser'}>
          Data: <strong>{live ? 'live database' : 'sandbox seed'}</strong>
        </span>
      </div>
    </nav>
  );
}
