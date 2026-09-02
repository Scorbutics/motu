// Which transport the lagoon wires at its composition root.
//
// There are exactly two modes and only one of them is a place to LOOK. Mock is the lagoon: every
// state it renders is one a scenario, a seed, a channel or a source declared, which is what makes a
// lagoon address mean the same thing to two people and what makes a snapshot a baseline rather than
// a photograph of a moment.
//
// HTTP exists for ONE caller — `motu fixtures record <island> --transport http`, which boots a
// headless lagoon against the real backend, drives the island's declared scenarios and WRITES
// FIXTURES TO DISK. Nothing is previewed and nothing is asserted against live data: the output is a
// declared artifact that everything downstream compares against, the same shape as an app's own
// capture-refresh script.
//
// SO IT IS NOT A BROWSER CHOICE. There used to be a chip in the chrome, a `?transport=http` query
// param and a remembered `motu:transport` in localStorage, and together they broke the promise the
// addressing is built on: the address still resolved, `__motuLagoonState.ok` stayed true, and what
// rendered was whatever the backend held that second. That is precisely the failure a name resolving
// to nothing REFUSES to render for — reintroduced through a switch, and made sticky across every
// address opened afterwards by the localStorage leg. The far side of the port is not the lagoon's to
// prove; that belongs to the operations ledger and to unit tests over the port.
//
// What is left is a build-time input, set by the recorder and by nothing else.

export type TransportMode = 'mock' | 'http';

/**
 * The mode a build was made with — `MOTU_TRANSPORT`, injected as `__MOTU_TRANSPORT__`.
 *
 * Anything but the literal `'http'` is `'mock'`, so an unset, empty or misspelled value fails
 * SAFE: the lagoon still works offline against fixtures rather than pointing at a backend nobody
 * asked for.
 */
export function resolveTransportMode(buildDefault = ''): TransportMode {
  return buildDefault === 'http' ? 'http' : 'mock';
}
