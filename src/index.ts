// Public surface of the project: the element registry and the archipelago configs + resolver.
// Composition roots (and the motu lagoon / CLI harness) import everything they need from here.
export { ELEMENT_REGISTRY } from './islands/registry.js';
export { ARCHIPELAGOS, getArchipelago } from './archipelagos/registry.js';
export { reviewArchipelago } from './archipelagos/review/review.archipelago.js';
