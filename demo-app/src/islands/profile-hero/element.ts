import type { ElementSpec } from '@motu/react';
import { ProfileHero, type ProfileHeroProps } from '../../ui/profile-hero/ProfileHero.js';

export const profileHeroElement: ElementSpec = {
  tag: 'x-profile-hero',
  component: ProfileHero,
  options: {
    // READS `member` AND `calendar`, OWNS NEITHER. Both are host-fed: the page resolves the id from
    // the URL and the region's channel answers with the calendar. The hero's only output is a
    // navigation intent, which is not a store write — so this island claims no key at all, and the
    // calendar islands beside it are free to own the ones they do.
    contract: {
      input: ['member', 'calendar', 'loading'] as (keyof ProfileHeroProps & string)[],
    },
    // THE ONE PART OF THIS FILE THAT IS A DECISION. Everything else here is read off the component
    // by `motu island sync`; this says that the callback `onBack` is called `profile-back` in the
    // region's vocabulary. Worth the line: derived from the callback it would be `back`, which is
    // ambiguous the moment a second island on some page also has a back control.
    //
    // AND GETTING IT WRONG IS SILENT IN EXACTLY ONE DIRECTION. The archipelago's `on` key must be
    // the emitted name; when it was not, nothing wired, the component was handed no `onBack`, and
    // the back button simply did not render. No error anywhere — `ArchipelagoConfig` is the untyped
    // shape, so `RegionWiringOk` never saw it. That is bench defect C5, met in the wild.
    events: { onBack: 'profile-back' },
    legacy: 'fill',
  },
};
