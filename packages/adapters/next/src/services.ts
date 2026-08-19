// The contract seam for a Next host — the analogue of `@BrowserCallable` + `MotuEndpoint` on the
// Jakarta side, and the piece that lets an island's server I/O be replayed by MockTransport.
//
// The Java seam needs an annotation processor because it has to DISCOVER which methods are callable
// across a whole compiled codebase. TypeScript needs no such thing: the callable surface is an object
// literal the app writes, and its type IS the contract. That is strictly better than codegen here —
// there is no regeneration step to forget, and a signature change fails `tsc` at the call site
// immediately rather than after someone re-runs a generator.
//
// Deny-by-default is structural rather than enforced: a method is reachable only if it appears in
// this map. Nothing else in the app is exposed, and there is no pattern, prefix or convention that
// could accidentally widen the surface.

/** A browser-callable method. Args and result cross the wire as JSON, so both must be serialisable. */
export type MotuMethod = (...args: never[]) => Promise<unknown>;

/** The callable surface: service name -> method name -> implementation. */
export type MotuServiceMap = Record<string, Record<string, MotuMethod>>;

/**
 * Declare the browser-callable surface.
 *
 * Identity at runtime; its job is to fix the type so `typeof services` can be handed to
 * `createContract` on the client. Keep the returned type — do not widen it to MotuServiceMap, or the
 * contract loses every signature.
 *
 * ```ts
 * export const services = defineServices({
 *   directory: {
 *     // Thin wrappers the APP owns: they build the request-scoped client, so the app's own
 *     // row-level security decides what this user may read. motu never sees a credential.
 *     async getSectors() { return getDirectorySectors(await createSupabaseServerClient()) },
 *   },
 * })
 * export type AppServices = typeof services
 * ```
 */
export function defineServices<const S extends MotuServiceMap>(services: S): S {
  return services;
}
