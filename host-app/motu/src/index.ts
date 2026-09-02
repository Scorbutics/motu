// Public surface of the project: the element registry and the archipelago configs + resolver.
// Composition roots (and the motu lagoon / CLI harness) import everything they need from here.
//
// NO `.js` ON THESE SPECIFIERS, and the scaffold writes them with one. Turbopack has no
// `extensionAlias`, so `./islands/registry.js` is simply an unresolved module and `next build` stops
// here — the same failure acme's next.config.mjs records having fixed inside motu's own packages, back
// again in the files motu generates. `moduleResolution: "Bundler"` makes the extension optional, so
// dropping it works for every bundler rather than adding a mapping per host.
export { ELEMENT_REGISTRY } from './islands/registry';
export { ARCHIPELAGOS, getArchipelago } from './archipelagos/registry';
export { corpusArchipelago } from './archipelagos/corpus/corpus.archipelago';
export { signinArchipelago } from './archipelagos/signin/signin.archipelago';
export { indexArchipelago } from './archipelagos/index/index.archipelago';
export { reviewArchipelago } from './archipelagos/review/review.archipelago';
