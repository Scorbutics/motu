'use client';
// The composition root for the `index` PAGE archipelago.
//
// 100% motu, by design — it imports nothing from the application, which is the constraint that keeps
// it deletable whole. See `signin-region.tsx`; the transport and host bridge are copied from it
// rather than chosen again, because those are environment decisions this project already made.
import { createRegion, nextHostBridge } from '@motu/adapter-next';
import { useRouter } from 'next/navigation';
import { ELEMENT_REGISTRY } from 'motu-host-islands';
// The ARCHIPELAGO comes from its own module, not from the barrel beside the registry.
// A barrel that exports the island registry pulls in every island, so an island whose view
// reaches an application page — and that page composing a region — closes a cycle back to this
// file, and `createRegion` then reads the archipelago before it is initialised. It cost acme a
// day: eight hops, every region blank, and a page that said nothing. `integrate check` warns
// about it now (`root-imports`); this is the shape it asks for.
import { indexArchipelago } from '@/motu/src/archipelagos/index/index.archipelago';

export const Index = createRegion(indexArchipelago, {
  elements: ELEMENT_REGISTRY,
  // NO TRANSPORT: this region makes no contract call. Everything it renders was handed to it by the
  // server, which is what a listing is.
  useHost: () => nextHostBridge(useRouter()),
});

export const MotuRegion = Index.Region;
