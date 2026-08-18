// The redesigned Members page: header + search + chips + results + actions over one shared store.
// Mode-specific bits (host, seed, channels) are supplied by each composition root via
// ArchipelagoOptions, not here.

import type { ArchipelagoConfig } from '@motu/core';
import { MEMBERS_LAYOUT } from './members.layout.js';

export interface MembersArchipelagoOptions {
  /** Optional hero badge text (the standalone preview sets this; embedded leaves it off). */
  badge?: string;
}

export function membersArchipelago(opts: MembersArchipelagoOptions = {}): ArchipelagoConfig {
  return {
    id: 'members',
    layout: MEMBERS_LAYOUT,
    islands: [
      {
        slot: 'member-header',
        element: 'x-member-header',
        props: {
          heading: 'Members',
          subtitle: 'Browse and add community members',
          ...(opts.badge ? { badge: opts.badge } : {}),
        },
      },
      {
        // The destination search the archipelago layout renders (lagoon + whole-region preview).
        slot: 'member-search-ng',
        element: 'x-member-search-ng',
        bind: { criteria: 'criteria', config: 'searchConfig' },
        on: {
          'criteria-changed': (detail, { store }) => store.set('criteria', detail),
          reset: (_detail, { store }) => store.set('criteria', {}),
        },
      },
      {
        slot: 'member-chips',
        element: 'x-member-filter-chips',
        bind: { criteria: 'criteria' },
        on: { 'criteria-changed': (detail, { store }) => store.set('criteria', detail) },
      },
      {
        slot: 'member-results',
        element: 'x-member-results',
        // Self-fetch via the generated contract (the archipelago owns its data): criteria changes
        // from ANY island filter it — no host-specific driving needed.
        bind: { criteria: 'criteria' },
        on: {
          'member-open': (id, { host }) => host.navigate('/member/edit?id=' + String(id)),
          'member-selected': (detail, { store }) => store.set('selectedMember', detail),
          'member-count': (count, { store }) => store.set('resultCount', count),
        },
      },
      {
        slot: 'member-actions',
        element: 'x-member-actions',
        on: {
          'member-new': (_detail, { host }) => host.navigate('/member/edit'),
          'member-paste': (_detail, { host }) => host.navigate('/member/paste'),
        },
      },
    ],
  };
}
