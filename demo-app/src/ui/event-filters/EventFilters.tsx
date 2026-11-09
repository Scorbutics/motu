import type { ClubEvent, EventFilter, EventKind } from '../../shared/event-types.js';
import { ALL_EVENTS, EVENT_KIND_LABELS, filterEvents } from '../../shared/event-types.js';
import { shortChapter } from '../../shared/gamification.js';
import { firstString, type MemberRow } from '../../shared/member-types.js';

export interface EventFiltersProps {
  /** The filter in force. Absent is everything. */
  filter?: EventFilter | null;
  /** Every upcoming event — what the tab counts are counted over. */
  events?: ClubEvent[];
  /** Who is signed in: their chapter is what "My chapter" means. A guest has no such tab. */
  me?: MemberRow | null;
  /** The filter changed. The region stores it; the list reads it. */
  onFilterChange?: (filter: EventFilter) => void;
}

const KINDS: EventKind[] = ['meetup', 'workshop', 'social', 'talk'];

/**
 * Which events to show: by who runs them (all, your chapter, the whole club) and by what they are.
 *
 * The counts are the SAME function the list filters with (`filterEvents`), so a tab that says 6 opens
 * a list of 6. "My chapter" counts the whole-club events too — they are yours as much as anyone's.
 */
export function EventFilters({ filter, events = [], me = null, onFilterChange }: EventFiltersProps) {
  const f = filter ?? ALL_EVENTS;
  const chapter = me ? firstString(me, ['chapter']) ?? null : null;
  const scopes: { id: EventFilter['scope']; label: string }[] = [
    { id: 'all', label: 'All' },
    ...(chapter ? [{ id: 'mine' as const, label: shortChapter(chapter) }] : []),
    { id: 'club', label: 'Whole club' },
  ];
  const set = (next: Partial<EventFilter>) => onFilterChange?.({ ...f, ...next });
  return (
    <div className="cl-evf">
      <div className="cl-tabs" role="group" aria-label="Who runs it">
        {scopes.map((s) => {
          const on = f.scope === s.id;
          return (
            <button key={s.id} type="button" className={`cl-btn cl-btn--plain cl-lg cl-tab${on ? ' cl-tab--on' : ''}`} aria-pressed={on} onClick={() => set({ scope: s.id })}>
              {s.label} <small>{filterEvents(events, { scope: s.id, kind: f.kind }, chapter).length}</small>
            </button>
          );
        })}
      </div>
      <div className="cl-evf__kinds" role="group" aria-label="What kind">
        {KINDS.map((k) => {
          const on = f.kind === k;
          return (
            <button key={k} type="button" className={`cl-evf__kind cl-kind cl-kind--${k}${on ? ' cl-evf__kind--on' : ''}`} aria-pressed={on} onClick={() => set({ kind: on ? null : k })}>
              {EVENT_KIND_LABELS[k]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
