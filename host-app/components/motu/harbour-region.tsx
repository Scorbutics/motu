'use client';
// The composition root for the dock example's OUTER region. 100% motu — it imports nothing from the
// application. See `index-region.tsx` for why the archipelago comes from its own module.
import { createRegion, nextHostBridge } from '@motujs/adapter-next';
import { useRouter } from 'next/navigation';
import { ELEMENT_REGISTRY } from 'motu-host-islands';
import { harbourArchipelago } from '@/motu/src/archipelagos/harbour/harbour.archipelago';

export const Harbour = createRegion(harbourArchipelago, {
  elements: ELEMENT_REGISTRY,
  useHost: () => nextHostBridge(useRouter()),
});

export const MotuHarbourRegion = Harbour.Region;
