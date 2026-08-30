'use client';
// The composition root for the `lagoon-view` archipelago — the dock around a framed artifact.
//
// 100% motu, by design: it imports nothing from the application, which is what keeps it deletable
// whole. Copied in shape from `index-region.tsx` rather than decided again — the transport and host
// bridge are environment decisions this project already made.
import { createRegion, nextHostBridge } from '@motu/adapter-next';
import { useRouter } from 'next/navigation';
import { ELEMENT_REGISTRY } from 'motu-host-islands';
// The ARCHIPELAGO from its own module, never the barrel beside the registry — a barrel pulls in every
// island, and an island reaching an application page that composes a region closes a cycle back to
// here. `integrate check` warns about it (`root-imports`); this is the shape it asks for.
import { lagoonViewArchipelago } from '@/motu/src/archipelagos/lagoon-view/lagoon-view.archipelago';

export const LagoonView = createRegion(lagoonViewArchipelago, {
  elements: ELEMENT_REGISTRY,
  // NO TRANSPORT: this region asks the framed artifact nothing through a contract. What it knows
  // comes from the artifact's own catalogue, which the page reads and feeds in.
  useHost: () => nextHostBridge(useRouter()),
});

export const MotuRegion = LagoonView.Region;
