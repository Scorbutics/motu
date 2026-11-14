// @motujs/adapter-next — the Next.js host adapter.
//
// Deliberately small. The AngularJS adapter is large because AngularJS is a foreign framework: it needs
// channels to mirror $http/$scope into the store, and a custom-element definer to cross the boundary.
// A Next host is already React, so neither applies — an island mounts directly. What remains is the
// part that is genuinely host-specific: turning outward intents into App Router navigation, declaring
// the browser-callable surface, and (in ./verify, loaded by `motu island verify`) policing the RSC
// boundary an island must stay inside.
//
// The server dispatcher lives behind ./server so a client bundle can never pull it in by accident.
export { nextHostBridge, collectingHostBridge } from './host-bridge';
export type { NextRouterLike, NextHostBridgeOptions } from './host-bridge';
export { Archipelago } from './archipelago';
// Re-exported so a Next host has one import site for the region surface.
export { createRegion } from '@motujs/react';
export type { CreateRegionOptions, RegionBinding } from '@motujs/react';
export type { ArchipelagoProps } from './archipelago';
// Re-exported so a page places islands without also importing @motujs/react directly.
export { Island, useMotuStore } from '@motujs/react';
export type { IslandProps } from '@motujs/react';
export { defineServices } from './services';
export type { MotuServiceMap, MotuMethod } from './services';
export { createContract } from './contract';
export type { Contract } from './contract';
