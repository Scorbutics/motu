// The members page, gamified: the directory, and the club's game around it.
//
// THE STATE MODEL, and who owns what:
//
//   criteria       written by the search box, the plan tabs (both `criteria-changed`); read by the
//                  table, the box and the tabs. Three controls, one fact.
//   overview       HOST-FED. The club's game state — XP, levels, the quest, the podium, the Cup, the
//                  feed — computed by the app's `clubSource` from every member row (`gamification.ts`).
//                  Read by seven islands and written by none: it is a projection of the membership,
//                  not something any control on this page changes.
//   asOf           HOST-FED. The day the game is computed for. Today on the page; a pinned day in the
//                  evidence, so a preview and an assertion mean the same thing next month.
//   dataSource     HOST-FED. Which backend answers — the header's "Sample data" / "Live data" pill.
//   resultCount    PRODUCED by the table; the page reads it back.
//   selectedMember PRODUCED by the table.
//
// The Filters popover (`x-member-search-ng`) and the active-filter chips left this region with the
// redesign: one search box and three plan tabs say everything they said, in the space a game needs.
// Both islands are still registered — the AngularJS ocean embeds the search on its own.
//
// Mode-specific bits (host, seed, channels) are supplied by each composition root, not here.
import type { ArchipelagoConfig } from '@motu/core';
import { MEMBERS_LAYOUT } from './members.layout.js';

export interface MembersArchipelagoOptions {
  /** Optional header pill text (the standalone preview sets this; embedded leaves it off). */
  badge?: string;
}

export function membersArchipelago(opts: MembersArchipelagoOptions = {}): ArchipelagoConfig {
  const setCriteria = (detail: unknown, { store }: { store: { set: (k: string, v: unknown) => void } }) => store.set('criteria', detail);
  return {
    id: 'members',
    layout: MEMBERS_LAYOUT,
    islands: [
      {
        slot: 'member-header',
        element: 'x-member-header',
        props: { heading: 'Members', ...(opts.badge ? { badge: opts.badge } : {}) },
        bind: ['overview', 'dataSource'],
      },
      { slot: 'member-highlights', element: 'x-member-highlights', bind: ['overview'] },
      {
        slot: 'member-quick-search',
        element: 'x-member-quick-search',
        bind: { criteria: 'criteria' },
        on: { 'criteria-changed': setCriteria },
      },
      {
        slot: 'member-plan-tabs',
        element: 'x-member-plan-tabs',
        bind: { criteria: 'criteria', overview: 'overview' },
        on: { 'criteria-changed': setCriteria },
      },
      {
        slot: 'member-actions',
        element: 'x-member-actions',
        on: {
          // THE ADD-A-MEMBER SCREEN. This used to say `/member/edit`, which the app's router reads as a
          // PROFILE whose id is "edit" — so the button opened "No such member".
          'member-new': (_detail, { host }) => host.navigate('/add'),
        },
      },
      {
        slot: 'member-results',
        element: 'x-member-results',
        // Self-fetch via the generated contract: criteria changes from ANY island filter it.
        bind: { criteria: 'criteria', asOf: 'asOf' },
        on: {
          // A ROW OPENS THE PROFILE. The island emits "someone wants to open this member" and the
          // REGION decides what that means — the podium and the feed say the same thing, the same way.
          'member-open': (id, { host }) => host.navigate('/member/' + encodeURIComponent(String(id))),
          'member-selected': (detail, { store }) => store.set('selectedMember', detail),
          'member-count': (count, { store }) => store.set('resultCount', count),
        },
      },
      { slot: 'weekly-quest', element: 'x-weekly-quest', bind: ['overview'] },
      {
        slot: 'high-scores',
        element: 'x-high-scores',
        bind: ['overview'],
        on: { 'member-open': (id, { host }) => host.navigate('/member/' + encodeURIComponent(String(id))) },
      },
      { slot: 'chapter-cup', element: 'x-chapter-cup', bind: ['overview'] },
      {
        slot: 'fresh-unlocks',
        element: 'x-fresh-unlocks',
        bind: ['overview'],
        on: { 'member-open': (id, { host }) => host.navigate('/member/' + encodeURIComponent(String(id))) },
      },
    ],
  };
}
