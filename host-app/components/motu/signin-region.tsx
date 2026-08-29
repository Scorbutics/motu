'use client';
// The composition root for the `signin` PAGE archipelago.
//
// 100% motu, by design: it imports nothing from the application, which is the constraint that keeps it
// deletable whole. This host declares `removable: false` — motu is load-bearing on motu's own surfaces
// by choice — so `removal-check` reports a SKIP here rather than a pass. That is not a licence to put
// application code in this file: the shape is what makes the same pattern honest in an adopting app,
// and it is the shape peps had to be taught the hard way (installing the source here dragged the auth
// client in, the file stopped qualifying, and removal left `createRegion` behind with its imports
// gone). The port belongs where the application is — the screen creates the source and renders the
// real component inside the island wrapper.
import { createRegion, nextHostBridge } from '@motu/adapter-next';
import { useRouter } from 'next/navigation';
import { ELEMENT_REGISTRY } from 'motu-host-islands';
// The ARCHIPELAGO comes from its own module, not from the barrel beside the registry.
// A barrel that exports the island registry pulls in every island, so an island whose view
// reaches an application page — and that page composing a region — closes a cycle back to this
// file, and `createRegion` then reads the archipelago before it is initialised. It cost peps a
// day: eight hops, every region blank, and a page that said nothing. `integrate check` warns
// about it now (`root-imports`); this is the shape it asks for.
import { signinArchipelago } from '@/motu/src/archipelagos/signin/signin.archipelago';

export const Signin = createRegion(signinArchipelago, {
  elements: ELEMENT_REGISTRY,
  // NO TRANSPORT, and that is a decision rather than an omission. A transport is how a contract call
  // leaves the island; this region makes none — signing in goes out as a declared INTENT, answered by
  // the source, which is a different seam. Handing it one anyway would be this environment answering a
  // question it was never asked.
  useHost: () => nextHostBridge(useRouter()),
});

/**
 * The region wrapper, for the page to wrap its content in.
 *
 * It seeds NOTHING. An earlier version fed `authError` in from a `useLayoutEffect` here, which never
 * runs on the server and left the refusal out of the delivered HTML. The page passes its values on
 * the island element instead and the wrapper publishes them into the region, which is the declared
 * path and the one that works in both renders.
 */
export const MotuRegion = Signin.Region;

/**
 * NO NAMED RE-EXPORTS OF THE BINDING'S PIECES.
 *
 * There was a `SigninRoot = Signin.Root` here, copied from peps, where it exists because that app's
 * region is composed by a SERVER component and a server component may not read a property off an
 * object a client module exported. This app's screen is already `"use client"`, so it can reach
 * `Signin.Root` directly — and it must: `motu integrate check` recognises the wrap form by the tag
 * ending in `.Root`, so an aliased `<SigninRoot>` reported both host-fed keys as never established
 * while the page was passing them exactly as before. Borrowing a workaround for a constraint this
 * app does not have cost two false warnings.
 */
