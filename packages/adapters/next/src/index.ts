// @motu/adapter-next — the Next.js host adapter.
//
// Deliberately small. The AngularJS adapter is large because AngularJS is a foreign framework: it needs
// channels to mirror $http/$scope into the store, and a custom-element definer to cross the boundary.
// A Next host is already React, so neither applies — an island mounts directly. What remains is the
// part that is genuinely host-specific: turning outward intents into App Router navigation, and (in
// ./verify, loaded by `motu island verify`) policing the RSC boundary an island must stay inside.
export { nextHostBridge, collectingHostBridge } from './host-bridge.js';
export type { NextRouterLike, NextHostBridgeOptions } from './host-bridge.js';
export { Archipelago } from './archipelago.js';
export type { ArchipelagoProps } from './archipelago.js';
