'use client';
// The composition root for the `corpus` PAGE archipelago.
//
// 100% motu, by design — it imports nothing from the application, which is the constraint that keeps
// it deletable whole. Identical in shape to `signin-region.tsx`, and deliberately so: the COMPOSITION
// SHAPE is what differs between these two regions, not the binding. A stage-1 region and a stage-2
// region bind their environment exactly the same way.
import { createRegion, nextHostBridge } from '@motu/adapter-next';
import { useRouter } from 'next/navigation';
import { ELEMENT_REGISTRY } from 'motu-host-islands';
// The ARCHIPELAGO comes from its own module, not from the barrel beside the registry.
// A barrel that exports the island registry pulls in every island, so an island whose view
// reaches an application page — and that page composing a region — closes a cycle back to this
// file, and `createRegion` then reads the archipelago before it is initialised. It cost peps a
// day: eight hops, every region blank, and a page that said nothing. `integrate check` warns
// about it now (`root-imports`); this is the shape it asks for.
import { corpusArchipelago } from '@/motu/src/archipelagos/corpus/corpus.archipelago';

export const Corpus = createRegion(corpusArchipelago, {
  elements: ELEMENT_REGISTRY,
  // NO TRANSPORT. This region makes no contract call: the corpus is read on the SERVER, by the page,
  // from the host's own table. Handing it a transport would be this environment answering a question
  // it was never asked.
  useHost: () => nextHostBridge(useRouter()),
});

export const MotuRegion = Corpus.Region;

/**
 * NOTE WHAT IS *NOT* EXPORTED HERE: a `Root`.
 *
 * The archipelago declares no `root`, so `Corpus.Root` would throw — motu's own error says so and
 * names the alternative: "declare the application's own component as `root` in the archipelago, or
 * compose the page yourself with <corpus.Island>". This region takes the second answer, which is
 * stage 1 of the adoption path in docs/06-composition-and-adoption.md.
 */
