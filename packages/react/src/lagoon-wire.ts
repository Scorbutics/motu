// A region's WIRE, declared — the fake `fetch` that answers HTTP beneath the application's own client.
//
// The wire and the channel are the lagoon's two stand-ins, and they answer different questions: a
// channel installs the app's own SOURCE over a port, so the source runs and the service beneath it
// does not; the wire answers HTTP under the real service, so the source AND everything below it runs.
// Both are right, for different reasons, and a region commonly has both.
//
// What was wrong was not the pair, it was the FORM. A channel was a field on the region's overrides,
// bound to its archipelago, installed by the lagoon for every view. The wire was a bare call at the
// module's top level — a side effect, bound to nothing, that had to be written in a particular place
// for a reason the file had to explain each time. Three consequences, all of them paid for:
//
//   - `appRoutes` was written TWICE, once to the fake and once to the installer, with no check that
//     the two agreed (`createPostgrestFetch` now stamps its own claim, so this one is gone);
//   - nothing tied the fake to a region, so nothing could compare the routes it answers against the
//     `reaches` the region's sources declare — the only evidence was `data-reach`, at runtime;
//   - the installer's idempotence guard was GLOBAL, so a second region with a wire was a silent
//     no-op (`installFakeFetch` now registers rather than latches).
//
// So the wire becomes what the channel already is: `wireFrom({ to, … })`, a field, installed by the
// lagoon. The bare `installFakeFetch` stays exported and still works — see `armFakeFetch` for the one
// case where a top-level call is still required.
import type { AnyArchipelagoConfig } from '@motu/core';
import { createPostgrestFetch, installFakeFetch, type PostgrestFetchOptions, type WireClaims } from '@motu/runtime/postgrest-fetch';

/** A wire motu can vouch for: it knows which region it answers for, and what it claims. */
export interface DeclaredWire<Id extends string = string> {
  /** WHICH REGION this wire answers for — the same stamp `channelFrom` leaves, for the same reason. */
  readonly regionId: Id;
  /**
   * The fake itself.
   *
   * Hand it to the application's database client (`createClient(url, key, { global: { fetch } })`)
   * where the app has one. Same-origin app routes do not go through that client, so those reach the
   * fake through the `globalThis.fetch` patch instead — which is what `install()` does.
   */
  readonly fetch: typeof fetch;
  /** The routes and origin it answers for, read back off the fake rather than restated. */
  readonly claims: WireClaims;
  /** Patch `globalThis.fetch` to consult this fake. Idempotent; the lagoon calls it for every view. */
  install(): void;
}

/**
 * A WIRE FAKE bound to the region it answers for.
 *
 * ```ts
 * const wire = wireFrom({
 *   to: reviewArchipelago,
 *   appRoutes: ['/api/repos', '/api/baselines'],
 *   fixtures: [{ service: '/api/repos', method: 'GET', response: { repos: REPOS } }],
 * });
 *
 * export const reviewRegion = overridesFor(reviewArchipelago, { seed, wire, channels: [ … ] });
 * ```
 *
 * The routes are written ONCE. `to` is a reference, so the region's name is written once too — in the
 * archipelago — exactly as `channelFrom({ to })` already made it.
 */
export function wireFrom<const A extends AnyArchipelagoConfig>(
  spec: { to: A } & PostgrestFetchOptions,
): DeclaredWire<A['id']> {
  const { to, ...options } = spec;
  const fake = createPostgrestFetch(options);
  return {
    regionId: to.id as A['id'],
    fetch: fake,
    claims: { appRoutes: options.appRoutes, baseUrl: options.baseUrl },
    // NO SECOND COPY OF THE ROUTES: the installer reads the claim the fake carries.
    install: () => installFakeFetch(fake),
  };
}
