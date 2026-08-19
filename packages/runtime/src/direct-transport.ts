import type { Transport } from './index.js';
import { MotuError } from './index.js';

/**
 * A Transport that dispatches to functions in this process instead of over the wire.
 *
 * HttpTransport exists because the Jakarta ocean keeps its data access on the server, where the
 * browser cannot reach it without a request. That is not universal. An app built on row-level
 * security does its reads from the browser already, holding the user's session — there is no server
 * tier to call, and routing an island's query through one would add a hop, a second client, and a
 * place for authorization to be reimplemented differently.
 *
 * What motu actually needs is not a network boundary but a SINGLE SEAM: one choke point every island
 * call passes through, so the lagoon can put MockTransport in its place and replay fixtures with no
 * backend. This gives that seam without inventing a server tier — the same island, calling the same
 * contract, is offline in the lagoon and live in the host.
 *
 * Authorization is untouched and stays exactly where the app already put it: these functions are the
 * app's own, and whatever they use (a session-bound client, row-level security) decides what the
 * caller may see. motu adds no credential and can widen nothing.
 *
 * ```ts
 * configure(new DirectTransport(services))   // host composition root
 * configure(new MockTransport(fixtures))     // lagoon — same components, no backend
 * ```
 */
export class DirectTransport implements Transport {
  constructor(private readonly services: Record<string, Record<string, (...args: never[]) => Promise<unknown>>>) {}

  async call<T>(service: string, method: string, args: unknown[]): Promise<T> {
    // Own-property lookups only: a plain index would resolve 'constructor' or '__proto__' and hand
    // back something that was never an exposed method. Deny-by-default has to mean the map, exactly.
    if (!Object.prototype.hasOwnProperty.call(this.services, service)) {
      throw new MotuError(404, `motu: no such service '${service}'`);
    }
    const impl = this.services[service];
    if (!impl || !Object.prototype.hasOwnProperty.call(impl, method)) {
      throw new MotuError(404, `motu: no such method '${service}.${method}'`);
    }
    const fn = impl[method];
    if (typeof fn !== 'function') {
      throw new MotuError(404, `motu: no such method '${service}.${method}'`);
    }
    return (await (fn as (...a: unknown[]) => Promise<unknown>)(...args)) as T;
  }
}
