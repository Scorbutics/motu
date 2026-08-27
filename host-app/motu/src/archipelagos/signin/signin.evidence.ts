// Declared FLOWS for the signin region — what this page promises, as something that runs.
//
// Sibling file, never the config: evidence must not travel into whatever bundles the archipelago.
//
// WHAT THIS REGION CAN HONESTLY PROMISE is narrower than a coupling, because nothing here flows from
// one island to another — there is one island. The promise is that every way this screen fails is
// SHOWN, in the words of whoever refused, and that the one act it offers actually leaves. Both are
// assertions on what an island renders, which is the only kind available and the kind that catches a
// slot wired to the wrong content after a merge.
//
// WHAT IS NOT HERE, and why: the "provider is not configured" failure is an island scenario rather
// than a flow. A flow drives the region through its declared acts, and that failure is not reachable
// by acting — it is the environment refusing, decided by the port the channel installed, not by
// anything a member can do. Pretending otherwise would mean a port that picks its outcome from a
// switch no member can touch, which is a flow only a human standing in front of the lagoon can drive.
import type { RegionScenario } from '@motu/runtime/mock';
// RELATIVE, like every other evidence import: these files are read by plain node, where the app's
// `@/…` alias does not resolve, and the failure is a silent "flows could not be read".
import {
  ACCESS_DENIED,
  AN_OFF_HOST_RETURN,
  A_LAGOON_TO_RETURN_TO,
  EXPIRED_CODE,
  OFF_HOST_REFUSAL,
} from '../../shared/signin-evidence.js';

export const scenarios: RegionScenario[] = [
  {
    // The slot's own coverage step: this slot renders THAT island. No stimulus, because the claim is
    // not a data flow — it is true of every state this island has — and `flow-mutation` is right to
    // reject an assertion on a constant that pretends otherwise. Worth making on its own: it is what
    // catches a slot rewired to a neighbour's content, which no static check can see.
    name: 'the sign-in slot is the sign-in control',
    seed: { returnTo: null },
    steps: [{ expectRender: { 'signin-form': 'Sign in with GitHub' } }],
  },
  {
    // The claim: whatever GitHub said, the member reads GITHUB's sentence and not ours.
    //
    // A real stimulus, and the step that fails if the page ever stops passing the provider's message
    // through — which is how somebody ends up reading a generic apology that does not match the
    // screen they just came from. `expectRender` rather than `expect`: asserting `authError` after
    // providing `authError` would only prove the lagoon stored what it was handed.
    // Named for what it asserts across BOTH steps rather than for the first seed: it starts on a
    // denial and ends on an expired handshake, and the claim is that whichever one arrived is the one
    // read back. Calling it "a refusal" described only the state it opens in.
    name: 'whatever the provider said is what the member reads',
    seed: { authError: ACCESS_DENIED, returnTo: null },
    steps: [
      { expectRender: { 'signin-form': ACCESS_DENIED } },
      // A DIFFERENT refusal, so the assertion cannot be passing on a constant.
      { provide: { authError: EXPIRED_CODE }, expectRender: { 'signin-form': EXPIRED_CODE } },
    ],
  },
  {
    // THE ONE ACT, DRIVEN END TO END — and this is the flow the whole exercise was for.
    //
    // The step fires the control's declared output; the signin SOURCE answers it over the lagoon's
    // port and reports back into the region. So what runs here is the application's own sign-in code.
    // What is asserted is what the member is left looking at while the browser is being handed over —
    // the state that lasts a moment in production, forever when the redirect never comes, and that
    // nothing could address at all while the button owned its own pending flag.
    name: 'asking to sign in says so, and keeps saying so',
    // `returnTo` SEEDED, because every real page load establishes it — `flow-shape` compares what the
    // page seeds against what the flows do, and a lagoon previewing a region with one fewer key than
    // users get is previewing a different region.
    seed: { authError: null, returnTo: A_LAGOON_TO_RETURN_TO },
    steps: [
      {
        emit: {
          slot: 'signin-form',
          event: 'sign-in-requested',
          detail: { returnTo: A_LAGOON_TO_RETURN_TO },
        },
        // The region holds the handoff, AND the address it granted…
        expect: { signingIn: true, signInError: null, destination: A_LAGOON_TO_RETURN_TO },
        // …and the member can SEE where they are coming back to. Asserting the DESTINATION rather
        // than only "Redirecting to GitHub…" is what makes this step depend on what the step did:
        // the pending words are the same whatever was asked, so a flow that stopped there was
        // asserting a constant and `flow-mutation` said so. The granted address is not a constant —
        // an ordinary visit resolves to the index instead.
        expectRender: { 'signin-form': `You will come back to ${A_LAGOON_TO_RETURN_TO}` },
      },
    ],
  },
  {
    // THE OPEN REDIRECT, REFUSED — driven through the screen, which is what this flow adds over the
    // unit test beside it. The guard runs in the source; what this asserts is that its refusal
    // REACHES somebody. A guard that silently dropped the address would pass every unit test and
    // strand a member on a page they did not ask for, with nothing on screen saying why.
    //
    // It is also what makes the step above provably sensitive: the SAME emit with a different address
    // ends somewhere else entirely, so neither assertion can be reading a constant.
    name: 'an address that leaves this host is refused, out loud',
    seed: { authError: null, returnTo: AN_OFF_HOST_RETURN },
    steps: [
      {
        emit: {
          slot: 'signin-form',
          event: 'sign-in-requested',
          detail: { returnTo: AN_OFF_HOST_RETURN },
        },
        expect: { signingIn: false, destination: null },
        expectRender: { 'signin-form': OFF_HOST_REFUSAL },
      },
    ],
  },
];
