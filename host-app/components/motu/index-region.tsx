'use client';
// The composition root for the `index` PAGE archipelago.
//
// 100% motu, by design — it imports nothing from the application, which is the constraint that keeps
// it deletable whole. See `signin-region.tsx`; the transport and host bridge are copied from it
// rather than chosen again, because those are environment decisions this project already made.
import { createRegion, nextHostBridge } from '@motu/adapter-next';
import { useRouter } from 'next/navigation';
import { ELEMENT_REGISTRY, indexArchipelago } from 'motu-host-islands';

export const Index = createRegion(indexArchipelago, {
  elements: ELEMENT_REGISTRY,
  // NO TRANSPORT: this region makes no contract call. Everything it renders was handed to it by the
  // server, which is what a listing is.
  useHost: () => nextHostBridge(useRouter()),
});

export const MotuRegion = Index.Region;
