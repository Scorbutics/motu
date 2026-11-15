'use client';
// The composition root for the dock example's INNER region. 100% motu.
import { createRegion, nextHostBridge } from '@motujs/adapter-next';
import { useRouter } from 'next/navigation';
import { ELEMENT_REGISTRY } from 'motu-host-islands';
import { quayArchipelago } from '@/motu/src/archipelagos/quay/quay.archipelago';

export const Quay = createRegion(quayArchipelago, {
  elements: ELEMENT_REGISTRY,
  useHost: () => nextHostBridge(useRouter()),
});

export const MotuQuayRegion = Quay.Region;
