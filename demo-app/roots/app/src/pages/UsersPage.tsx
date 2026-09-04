// The create-a-member page: a form on the left, and the card that would result on the right.
//
// The page holds NEITHER. It places two islands and reads back how complete the draft is — the
// coupling between them is the region's, declared in the archipelago, and this file could not
// reproduce it if it tried: `draft` is produced by the form, so the region's type omits it here and
// assigning it is a compile error.
import { Users } from '../motu/users-region.js';

/** Reads the region back, so the page proves it can — and so there is something to look at. */
function DraftStatus() {
  const region = Users.useRegion();
  const draft = (region.draft ?? {}) as Record<string, unknown>;
  const filled = ['fullName', 'email', 'chapter', 'memberNo', 'joined'].filter(
    (k) => typeof draft[k] === 'string' && (draft[k] as string).trim() !== '',
  ).length;
  return (
    <footer className="app__footer">
      {filled === 0 ? 'Nothing filled in yet' : `${filled} of 5 details filled in`}
    </footer>
  );
}

export function UsersPage() {
  return (
    <Users.Region>
      <div className="app__page app__page--split motu-root" data-theme="motu" data-motu-theme="motu">
        <div className="app__split">
          <Users.Island slot="member-form" />
          <Users.Island slot="member-card" />
        </div>
        <DraftStatus />
      </div>
    </Users.Region>
  );
}
