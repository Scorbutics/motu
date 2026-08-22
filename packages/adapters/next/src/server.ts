// The dispatcher: a Next Route Handler that turns an island's contract call into a call on one of
// the app's own functions. Mount it once, at a catch-all route.
//
// It deliberately does NOT do authorization. The Jakarta dispatcher invokes the real CDI bean so the
// host's existing @Roles interceptor fires untouched — motu translates the outcome to a status code
// and nothing more. The same rule holds here: the registry's methods build the app's own
// request-scoped Supabase client, so the app's row-level security decides what this user may read.
// motu never sees a credential, never issues one, and cannot widen access. An `authorize` hook is
// offered for coarse gating (is anyone logged in at all), not as the security boundary.
import type { MotuServiceMap } from './services';

export interface MotuRouteOptions {
  /**
   * Coarse gate run before dispatch. Return false (or throw) to refuse. This is a cheap early exit,
   * NOT the authorization boundary — that stays with the app's own data access rules.
   */
  authorize?: (req: Request, call: { service: string; method: string }) => boolean | Promise<boolean>;
  /** Map a thrown error to a status. Default 500. */
  statusForError?: (err: unknown) => number;
  /** Called for every failure, so the host can log through its own reporting. */
  onError?: (err: unknown, call: { service: string; method: string }) => void;
}

/** Unknown service/method is indistinguishable from an unknown URL: deny-by-default leaks nothing. */
function notFound() {
  return Response.json({ error: 'not found' }, { status: 404 });
}

/**
 * Build the POST handler for `app/api/motu/[...call]/route.ts`.
 *
 * The URL shape (`<base>/<service>/<method>`, args as a JSON array body) is HttpTransport's, so an
 * island needs no Next-specific transport: point `configure(new HttpTransport('/api/motu'))` at this
 * and the same component works against the real app here and against MockTransport in the lagoon.
 *
 * ```ts
 * // app/api/motu/[...call]/route.ts
 * import { createMotuRoute } from '@motu/adapter-next/server'
 * import { services } from '@/motu/server/services'
 * export const { POST } = createMotuRoute(services)
 * export const dynamic = 'force-dynamic'
 * ```
 */
export function createMotuRoute(services: MotuServiceMap, opts: MotuRouteOptions = {}) {
  async function POST(req: Request, ctx: { params: Promise<{ call?: string[] }> }) {
    const segments = (await ctx.params)?.call ?? [];
    if (segments.length !== 2) return notFound();
    const [service, method] = segments;

    // Own-property lookups only: a plain `services[service]` would happily resolve 'constructor' or
    // '__proto__' and hand back something that is not an exposed method at all.
    if (!Object.prototype.hasOwnProperty.call(services, service)) return notFound();
    const impl = services[service];
    if (!impl || !Object.prototype.hasOwnProperty.call(impl, method)) return notFound();
    const fn = impl[method];
    if (typeof fn !== 'function') return notFound();

    if (opts.authorize) {
      let allowed = false;
      try {
        allowed = await opts.authorize(req, { service, method });
      } catch {
        allowed = false;
      }
      // 401, not 403: the caller is unauthenticated. Existence is already established by this point.
      if (!allowed) return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    let args: unknown;
    try {
      args = await req.json();
    } catch {
      return Response.json({ error: 'body must be a JSON array of arguments' }, { status: 400 });
    }
    if (!Array.isArray(args)) {
      return Response.json({ error: 'body must be a JSON array of arguments' }, { status: 400 });
    }

    try {
      const result = await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
      // `undefined` is not JSON; a void method should still answer 200 with a body fetch can parse.
      return Response.json(result ?? null);
    } catch (err) {
      opts.onError?.(err, { service, method });
      const status = opts.statusForError?.(err) ?? 500;
      // The message is the app's own; do not leak a stack.
      return Response.json({ error: err instanceof Error ? err.message : 'error' }, { status });
    }
  }

  return { POST };
}
