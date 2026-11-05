// The add-a-member page: a form on the left, and the membership card that would result on the right.
//
// The page holds NEITHER. It places two islands and reads back how complete the draft is — the
// coupling between them is the region's, declared in the archipelago, and this file could not
// reproduce it if it tried: `draft` is produced by the form, so the region's type omits it here and
// assigning it is a compile error.
//
// THE HEADER IS THE PAGE'S OWN, in the club's design: a title block like the directory's, drawn here
// rather than islanded because it reads no region key and writes none — it is arrangement.
import { rankOf } from 'demo-app';
import { Users } from '../motu/users-region.js';

/** Reads the region back, so the page proves it can — and so there is something to look at. */
function DraftStatus() {
  const region = Users.useRegion();
  const draft = (region.draft ?? {}) as Record<string, unknown>;
  const filled = ['fullName', 'email', 'chapter', 'memberNo', 'joined'].filter(
    (k) => typeof draft[k] === 'string' && (draft[k] as string).trim() !== '',
  ).length;
  return (
    <footer className="cl-page__foot">
      {filled === 0 ? 'Nothing filled in yet' : `${filled} of 5 details filled in`}
    </footer>
  );
}

export function UsersPage() {
  return (
    <Users.Region>
      <div className="cl-page cl-scope">
        <header className="cl-head">
          <div className="cl-head__title cl-block">
            <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FBF3E2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
              <path d="M19 8v6M16 11h6" />
            </svg>
            <h1 className="cl-lg">New member</h1>
            <div className="cl-head__facts">
              Every member starts at level 1
              <br />
              <span className="cl-head__pill">{rankOf(1)} · 0 XP</span>
            </div>
          </div>
        </header>
        <div className="cl-page__split">
          <Users.Island slot="member-form" />
          <Users.Island slot="member-card" />
        </div>
        <DraftStatus />
      </div>
    </Users.Region>
  );
}
