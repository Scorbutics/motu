import { MotuError } from './index';
import { reachOwner, recordOutbound } from '@motu/core';
import { MockTransport, type Fixture } from './mock';

/**
 * A fake `fetch`, PostgREST-shaped, for injecting into `createClient(url, key, { global: { fetch } })`
 * (or `createBrowserClient`, which forwards the same option) — one layer BELOW where today's lagoon
 * stubs sit.
 *
 * WHY THIS EXISTS. A lagoon stub today replaces a whole service module by hand, which means the
 * module's OWN logic — orchestration, derived visibility rules, period math, whatever a real function
 * does beyond "read a table" — never runs in the lagoon at all. Nobody notices, because there is
 * nothing to notice: the swap is silent by construction. Swapping one layer down, at the wire, lets
 * every repository and service function run FOR REAL, everywhere — the lagoon, a runtime check, a
 * Playwright test — answered by synthetic data instead of synthetic logic.
 *
 * WHAT IT DOES NOT DO. This is not a PostgREST clone. It supports exactly the operators a real
 * project's client-side code was found to use (`eq`, `is`, `gte`, `lt`, `in`, `not.is.null`, a
 * two-clause `or=`, `order`, `limit`/`offset`, `select` as flat columns/`*`/one embed shape passed
 * through verbatim, `.single()`/`.maybeSingle()` via `Accept: vnd.pgrst.object+json`, `count=exact`,
 * writes with `Prefer: return=representation|minimal`, and `rpc`). A query shape outside that set is
 * an UNSCOPED REQUEST (see below), not a silent wrong answer — the fixture author is meant to notice
 * and extend the fake, not have it guess.
 */

export interface PostgrestTable {
  /**
   * Row data, filtered/sorted/paginated generically per request — this table's whole content.
   *
   * A plain array for a static fixture; a FUNCTION when the initial content needs to react to a
   * scenario's seed (`seededValue`, as `services-club-feed.ts` already does for the module-swap
   * stubs). A remount re-runs the READ, not the module — a table computed once at import time would
   * answer every later scenario with the first one's seed, same failure club-feed's own comment
   * documents. Called fresh on every GET, same as `FixtureResponse.response` already is.
   */
  rows: Record<string, unknown>[] | (() => Record<string, unknown>[]);
}

export interface PostgrestFetchOptions {
  /** Origin the fake answers for; requests to any other origin are UNSCOPED (see `recordUnscoped`). */
  baseUrl?: string;
  /** One entry per table the fake can read/write. Absent table = every read/write on it is unscoped. */
  tables?: Record<string, PostgrestTable>;
  /**
   * RPC results/failures and WRITE results/failures, and — the reason `after` exists — read failures
   * you want injected on top of the generic table engine (`{ service: table, method: 'select',
   * status, after }`) without hand-writing the whole read path. Resolved through `MockTransport`, so
   * `after`/`match`/`roles` all apply exactly as documented there.
   */
  fixtures?: Fixture[];
  /** `auth.getUser()` / `auth.getSession()` stand-ins — most apps route auth through their own client
   *  and never reach here, but two direct callers are common enough to be worth a first-class slot. */
  auth?: { user?: unknown; session?: unknown };
  /**
   * Same-origin application routes this fake answers — a Next.js `app/api/**` handler, a Rails
   * controller, anything the app calls with a RELATIVE url.
   *
   * These do not arrive through the database client, so they only reach here via `installFakeFetch`.
   * Declared as prefixes rather than assumed, because intercepting every same-origin request would
   * swallow the dev server's own traffic — HMR, assets, source maps — and a lagoon that cannot load
   * its own modules is a worse failure than an unanswered route.
   *
   * Answered from `fixtures` keyed by PATH: `{ service: '/api/admin/announcement', method: 'GET' }`.
   */
  appRoutes?: string[];
}

/** One request the fake could not answer from a declared table/fixture — the thing a check reports. */
export interface UnscopedRequest {
  method: string;
  path: string;
  /** `table:<name>` / `rpc:<name>` / `auth:<name>` / `unparsed` — what the fake tried to resolve. */
  target: string;
  reason: string;
}

/** Where unscoped requests accumulate for a check to read back after a run. Reset per fake instance. */
const registryKey = '__motuUnscopedRequests';
function recordUnscoped(entry: UnscopedRequest): void {
  const g = globalThis as unknown as Record<string, UnscopedRequest[] | undefined>;
  (g[registryKey] ??= []).push(entry);
}

/** Read back (and optionally clear) everything recorded since the page loaded or the last read. */
export function readUnscopedRequests(clear = true): UnscopedRequest[] {
  const g = globalThis as unknown as Record<string, UnscopedRequest[] | undefined>;
  const found = g[registryKey] ?? [];
  if (clear) g[registryKey] = [];
  return found;
}

/**
 * How many requests the fake answered at all, scoped or not — what `readUnscopedRequests().length ===
 * 0` needs alongside it before it can count as a pass. A check that examined nothing has not proven
 * "every request was covered"; it has proven nothing ran. Reported as `seen` so the CLI's own
 * "0 examined is a skip, not an ok" rule applies here automatically, same as everywhere else.
 */
const countKey = '__motuFakeFetchRequestCount';
function recordSeen(): void {
  const g = globalThis as unknown as Record<string, number | undefined>;
  g[countKey] = (g[countKey] ?? 0) + 1;
}

/**
 * Requests the fake DELEGATED that then failed — an app route nobody stubbed, most often.
 *
 * Read alongside the unscoped list: unscoped means "the fake saw it and had nothing for it", this
 * means "the fake never claimed it and the real answer was an error". Both say the island is standing
 * on something that is not there; they differ only in whether `appRoutes`/`baseUrl` reached it.
 */
export function readUnansweredRequests(clear = true): { method: string; url: string; status: number; why: string }[] {
  const g = globalThis as unknown as { __motuUnansweredRequests?: { method: string; url: string; status: number; why: string }[] };
  const found = g.__motuUnansweredRequests ?? [];
  if (clear) g.__motuUnansweredRequests = [];
  return found;
}

export function readFakeFetchRequestCount(clear = true): number {
  const g = globalThis as unknown as Record<string, number | undefined>;
  const n = g[countKey] ?? 0;
  if (clear) g[countKey] = 0;
  return n;
}

/** Which tables (and how they were used) and which RPCs an island actually reached. */
export interface DataReach {
  tables: Record<string, string[]>;
  rpcs: string[];
  /** Edge / serverless functions invoked (`functions.invoke`). */
  functions: string[];
  /** Same-origin application routes called, as `GET /api/…`. */
  routes: string[];
  /**
   * The same reach, split by WHO asked, in the vocabulary a declaration uses.
   *
   * Keys are `island:<tag>`, `source:<id>`, or `unattributed`; values are entries like
   * `table:shots(select)`, `rpc:accept_shots`, `fn:notify`, `route:GET /api/x`. The aggregate above
   * answers "what did this screen touch"; this answers "who has to have declared it", which is the
   * only form a check can compare — an island's reach is its own `contract.ambient`, a source's is
   * `reaches` on its `sources` entry, and charging one to the other would report a correct
   * declaration as a violation.
   */
  by: Record<string, string[]>;
}

/**
 * WHAT THIS ISLAND NEEDS FROM THE BACKEND, observed rather than declared.
 *
 * Mocking at the wire took something away. When each service module was stood down by name, an
 * island's `ambient` said `@/lib/services/challenges` and you could read its data dependency off the
 * contract. Now the service runs for real and only `@/lib/supabase/client` is stood down —
 * transitively, several modules below the component — so `ambient` (which reads DIRECT imports) can
 * no longer see it. The dependency did not disappear; it stopped being legible.
 *
 * This is the replacement, and it is strictly better than what it replaces: a table-and-RPC list is
 * what the island actually needs, at the granularity assay's `.assay/operations.json` already speaks
 * (tables read, tables written, functions called) — which is the seam a motu↔assay contract-drift
 * check would compare across.
 *
 * Recorded for every request, INCLUDING ones no fixture answered: what the island reached for is the
 * dependency, whether or not this lagoon happened to have data for it.
 */
const reachKey = '__motuDataReach';

/**
 * Who is reaching, right now.
 *
 * `reachOwner()` lives in @motu/core beside the island window `traced` already uses, so a host-module
 * call and a backend reach agree about who asked. Imported lazily-safe: this module is also loaded in
 * plain node by the fixture tests, where no window is ever open and the answer is `unattributed`.
 */
function ownerNow(): string {
  try {
    return reachOwner() ?? 'unattributed';
  } catch {
    return 'unattributed';
  }
}

/** One reach, as a DECLARATION spells it — the string an `ambient` or `reaches` entry is compared to. */
function reachEntry(kind: 'table' | 'rpc' | 'function' | 'route', name: string, method?: string): string {
  if (kind === 'table') return method ? `table:${name}(${method})` : `table:${name}`;
  if (kind === 'rpc') return `rpc:${name}`;
  if (kind === 'function') return `fn:${name}`;
  return `route:${method} ${name}`;
}

function recordReach(kind: 'table' | 'rpc' | 'function' | 'route', name: string, method?: string): void {
  const g = globalThis as unknown as Record<string, DataReach | undefined>;
  const reach = (g[reachKey] ??= { tables: {}, rpcs: [], functions: [], routes: [], by: {} });
  // BACK-FILLED, because a reach recorded before this field existed (a page held open across a
  // reload, an older bundle) would otherwise crash the split on `undefined`.
  reach.by ??= {};
  // AT REQUEST TIME, like `traced` reads its island: a fetch starts inside the owner's window and
  // resolves long after it has closed, so asking afterwards attributes everything to nobody.
  const owner = ownerNow();
  const declaredForm = reachEntry(kind, name, method);
  // The unified ledger gets the SAME string `data-reach` compares against declarations, so one readout
  // can show a wire reach beside a contract call without translating between two vocabularies.
  recordOutbound('wire', declaredForm);
  const mine = (reach.by[owner] ??= []);
  if (!mine.includes(declaredForm)) mine.push(declaredForm);
  if (kind === 'rpc' || kind === 'function' || kind === 'route') {
    const list = kind === 'rpc' ? reach.rpcs : kind === 'function' ? reach.functions : reach.routes;
    const entry = kind === 'route' ? `${method} ${name}` : name;
    if (!list.includes(entry)) list.push(entry);
    return;
  }
  const methods = (reach.tables[name] ??= []);
  if (method && !methods.includes(method)) methods.push(method);
}

/**
 * THE CALLS THEMSELVES — what was asked, with what, and what came back.
 *
 * `DataReach` above is a SET of names: it answers "did this screen touch `team_schedules`", which is
 * the question a DECLARATION asks. It cannot answer "did my save actually send the new hour", and
 * that is the question a person asks when a screen appears to do nothing.
 *
 * WHY THIS HAS TO EXIST HERE. Intercepting `fetch` is the point of the lagoon, and the side effect is
 * that the browser's own Network panel shows NOTHING: no request is made, so no tool that watches the
 * network can see the app's traffic. motu removed the standard instrument, so motu owes the
 * replacement — the same argument `traced()`/`provenance` already makes one layer up, for host
 * modules ("the lagoon shows the result and never the question").
 *
 * IT PROVES THE CLIENT HALF ONLY, and the panel that renders it should say so. A request leaving with
 * the right payload cannot tell you the refetch happened, that the response was merged, or that the
 * screen re-rendered. It is the diagnosis for "nothing happened" — the write fired and the read did
 * not change — not evidence that a feature works.
 */
export interface WireCall {
  /** Monotonic, so a UI can order and de-duplicate without trusting the clock. */
  seq: number;
  at: number;
  /** The declaration's own spelling: `rpc:set_session_agenda`, `table:teams(select)`, `fn:x`. */
  target: string;
  /** The HTTP verb, for the table calls where it is the difference between a read and a write. */
  method: string;
  /** `island:<tag>`, `source:<id>` or `unattributed` — the same attribution `data-reach` uses. */
  by: string;
  /** What was sent: an RPC's arguments, a write's row, a read's query string. Truncated. */
  request?: unknown;
  status?: number;
  /** A SUMMARY, never the body: a row count, or the error. Bodies are unbounded and mostly noise. */
  response?: string;
}

const callsKey = '__motuWireCalls';
/**
 * A ring, because a lagoon left open re-fetches forever and an unbounded log is a leak. 200 is far
 * more than any one interaction produces (the largest here was 22) and small enough to render.
 */
const MAX_CALLS = 200;
let callSeq = 0;

/**
 * Bounded, and never the whole body.
 *
 * 20 kB rather than 2, because the panel EXPANDS these now: a row you can open to read the payload is
 * only worth opening if the payload is there, and the largest real one here — a regenerated séance
 * series — is about 21 kB. The ring above bounds the count; this bounds each entry, and the product
 * is the worst case. It is a dev overlay in a page that already holds the application.
 */
function summarise(value: unknown, max = 20_000): unknown {
  if (value === undefined || value === null) return value;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    return json.length <= max ? JSON.parse(json) : `${json.slice(0, max)}… (${json.length} chars)`;
  } catch {
    return String(value);
  }
}

function recordCall(call: Omit<WireCall, 'seq' | 'at'>): void {
  const g = globalThis as unknown as Record<string, WireCall[] | undefined>;
  const calls = (g[callsKey] ??= []);
  calls.push({ ...call, seq: ++callSeq, at: Date.now() });
  if (calls.length > MAX_CALLS) calls.splice(0, calls.length - MAX_CALLS);
}

/** Every intercepted call, oldest first. Does NOT clear: a panel polls it, and a flow may read it twice. */
export function readWireCalls(): WireCall[] {
  const g = globalThis as unknown as Record<string, WireCall[] | undefined>;
  return [...(g[callsKey] ?? [])];
}

export function clearWireCalls(): void {
  (globalThis as unknown as Record<string, WireCall[] | undefined>)[callsKey] = [];
}

export function readDataReach(clear = true): DataReach {
  const g = globalThis as unknown as Record<string, DataReach | undefined>;
  const found = g[reachKey] ?? { tables: {}, rpcs: [], functions: [], routes: [], by: {} };
  if (clear) g[reachKey] = { tables: {}, rpcs: [], functions: [], routes: [], by: {} };
  return found;
}

// --- Filter evaluation -----------------------------------------------------------------------------
// PostgREST encodes a filter as `column=operator.value` in the query string. Only the operators found
// in actual use are implemented; anything else fails to parse the FILTER (not the whole request) and
// is reported as unscoped, so a fixture author sees exactly what is missing rather than a wrong count.

type FilterOp = { column: string; op: string; value: string };

function parseFilterValue(raw: string): { op: string; value: string } | null {
  const dot = raw.indexOf('.');
  if (dot === -1) return null;
  return { op: raw.slice(0, dot), value: raw.slice(dot + 1) };
}

/** `col=in.(a,b,c)` → `['a','b','c']`; PostgREST's own list syntax, not JSON. */
function parseInList(value: string): string[] {
  const inner = value.startsWith('(') && value.endsWith(')') ? value.slice(1, -1) : value;
  return inner.length ? inner.split(',') : [];
}

function coerce(value: string): unknown {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function matchesOp(rowValue: unknown, op: string, rawValue: string): boolean {
  switch (op) {
    case 'eq':
      return rowValue === coerce(rawValue);
    case 'is':
      return rowValue === coerce(rawValue);
    case 'neq':
      return rowValue !== coerce(rawValue);
    case 'gte':
      return typeof rowValue === 'string' || typeof rowValue === 'number' ? rowValue >= coerceOrdered(rowValue, rawValue) : false;
    case 'gt':
      return typeof rowValue === 'string' || typeof rowValue === 'number' ? rowValue > coerceOrdered(rowValue, rawValue) : false;
    case 'lte':
      return typeof rowValue === 'string' || typeof rowValue === 'number' ? rowValue <= coerceOrdered(rowValue, rawValue) : false;
    case 'lt':
      return typeof rowValue === 'string' || typeof rowValue === 'number' ? rowValue < coerceOrdered(rowValue, rawValue) : false;
    case 'in':
      return parseInList(rawValue).some((v) => rowValue === coerce(v));
    default:
      return false;
  }
}

/** Compare like-to-like: a numeric row value against a numeric literal, else lexical string compare. */
function coerceOrdered(rowValue: unknown, rawValue: string): string | number {
  return typeof rowValue === 'number' ? Number(rawValue) : rawValue;
}

/**
 * `not.<op>.<value>` — only the shape actually used (`not.is.null`) is supported; anything else is
 * left unrecognized so the caller can report it rather than silently mis-evaluating.
 */
function parseNot(raw: string): FilterOp['op'] | null {
  if (raw === 'is.null') return 'not.is.null';
  return null;
}

/** One clause of `or=(a.is.null,b.gt.5)` — reuses the same operator vocabulary as a plain filter. */
function evalOrClause(row: Record<string, unknown>, clause: string): boolean | null {
  const [column, ...rest] = clause.split('.');
  const opValue = rest.join('.');
  const parsed = parseFilterValue(opValue);
  if (!parsed || !column) return null;
  return matchesOp(row[column], parsed.op, parsed.value);
}

const KNOWN_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'or']);

/**
 * Apply every recognized filter param to a table's rows. Returns `null` (not an error) the moment an
 * UNRECOGNIZED filter shows up, so the caller can report the request as unscoped instead of returning
 * a silently-wrong subset — a filter this fake does not understand is exactly the "nothing was scoped
 * for this" case the whole design exists to surface.
 */
function applyFilters(rows: Record<string, unknown>[], params: URLSearchParams): Record<string, unknown>[] | null {
  let result = rows;
  for (const [key, raw] of params.entries()) {
    if (KNOWN_PARAMS.has(key)) continue;
    if (key === 'not') continue; // handled per-column below via the `col=not.is.null` form instead
    if (raw.startsWith('not.')) {
      const notOp = parseNot(raw.slice(4));
      if (!notOp) return null;
      result = result.filter((r) => r[key] !== null);
      continue;
    }
    const parsed = parseFilterValue(raw);
    if (!parsed) return null;
    if (!['eq', 'is', 'neq', 'gte', 'gt', 'lte', 'lt', 'in'].includes(parsed.op)) return null;
    result = result.filter((r) => matchesOp(r[key], parsed.op, parsed.value));
  }
  const or = params.get('or');
  if (or !== null) {
    const inner = or.startsWith('(') && or.endsWith(')') ? or.slice(1, -1) : or;
    const clauses = inner.split(',');
    const evaluated = clauses.map((c) => evalOrClause({} as Record<string, unknown>, c)); // shape check
    if (evaluated.some((v) => v === null)) return null;
    result = result.filter((r) => clauses.some((c) => evalOrClause(r, c) === true));
  }
  return result;
}

function applyOrder(rows: Record<string, unknown>[], order: string | null): Record<string, unknown>[] {
  if (!order) return rows;
  const parts = order.split(',').map((p) => {
    const [column, direction] = p.split('.');
    return { column, desc: direction === 'desc' };
  });
  return [...rows].sort((a, b) => {
    for (const { column, desc } of parts) {
      const av = a[column];
      const bv = b[column];
      if (av === bv) continue;
      const cmp = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
      return desc ? -cmp : cmp;
    }
    return 0;
  });
}

/** `select=` as this fake understands it: flat columns, `*`, or an embed passed through verbatim —
 *  it does not JOIN, it trusts the fixture row already carries the embedded shape if one is selected. */
function applySelect(rows: Record<string, unknown>[], select: string | null): Record<string, unknown>[] {
  if (!select || select === '*') return rows;
  const cols = select.split(',').map((c) => c.trim());
  if (cols.some((c) => c.includes('('))) return rows; // an embed: trust the fixture's own shape
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
}

// --- Request parsing ---------------------------------------------------------------------------

interface ParsedRequest {
  method: string;
  path: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

/** Where a RELATIVE url resolves from. A browser has `location`; node (the `--fast` lane, and this
 *  module's own tests) does not, and `new Request('/api/x')` throws there rather than defaulting. */
function originBase(): string {
  return typeof location !== 'undefined' && location.href ? location.href : 'http://lagoon.local';
}

/**
 * SYNCHRONOUS, and that is load-bearing rather than tidiness.
 *
 * A reach is attributed to whoever's window is open when the request is MADE (see `ownerNow`). This
 * function does no awaiting — it never did — but being `async` meant the caller's `await` yielded a
 * microtask before any `recordReach` ran, by which time `runWithIsland`/`runWithSource` had already
 * restored the previous owner and every reach recorded as `unattributed`. Keep the whole path from
 * the fake's entry to `recordReach` synchronous.
 */
function normalize(input: RequestInfo | URL, init?: RequestInit): ParsedRequest {
  // Resolved against the origin BEFORE constructing the Request, because an app route is called with
  // a relative path (`fetch('/api/…')`) and that is exactly the case this fake was extended for.
  const absolute = input instanceof Request ? input : new URL(String(input), originBase()).href;
  const req = absolute instanceof Request ? absolute : new Request(absolute, init);
  const url = new URL(req.url);
  let body: unknown = undefined;
  if (init?.body !== undefined) {
    try {
      body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    } catch {
      body = init.body;
    }
  }
  return { method: (init?.method ?? req.method ?? 'GET').toUpperCase(), path: url.pathname, url, headers: req.headers, body };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function postgrestError(status: number, message: string): Response {
  return jsonResponse({ message, details: null, hint: null, code: String(status) }, status);
}

/**
 * Build a `fetch`-compatible function backed entirely by declared tables and fixtures. Anything it
 * cannot resolve is recorded via `readUnscopedRequests()` and answered with a real-shaped 404 — the
 * app's own error handling runs for real against it, same as it would against an actual gap in a real
 * backend, rather than the harness hanging or throwing somewhere the app never catches.
 */
/**
 * The target a request is ABOUT, spelled the way a declaration spells it.
 *
 * Derived from the path rather than reported by the handler, so the log records a call even when the
 * handler never ran — an origin outside `baseUrl`, an unrecognised path. Those are exactly the
 * requests worth seeing: they are the ones that silently answered 404.
 */
function targetOf(req: ParsedRequest, appRoutes: string[]): string {
  if (appRoutes.some((p) => req.path.startsWith(p))) return `route:${req.method} ${req.path}`;
  if (req.path.startsWith('/auth/v1/')) return `auth:${req.path.slice('/auth/v1/'.length)}`;
  if (req.path.startsWith('/functions/v1/')) return `fn:${req.path.slice('/functions/v1/'.length)}`;
  if (req.path.startsWith('/rest/v1/rpc/')) return `rpc:${req.path.slice('/rest/v1/rpc/'.length)}`;
  if (req.path.startsWith('/rest/v1/')) return `table:${req.path.slice('/rest/v1/'.length).split('?')[0]}`;
  return 'unparsed';
}

/** What was SENT: an RPC's arguments or a write's row, else the query that scoped a read. */
function requestOf(req: ParsedRequest): unknown {
  if (req.body !== undefined && req.body !== null) return req.body;
  const query = req.url.search.replace(/^\?/, '');
  return query === '' ? undefined : query;
}

/**
 * What came BACK, as one line. Never the body: a read can answer with a whole table, and a log that
 * holds every row it ever saw is a memory leak wearing a diagnostic's clothes.
 */
async function responseOf(res: Response): Promise<string | undefined> {
  if (res.status === 204) return 'no content';
  try {
    const text = await res.clone().text();
    if (text === '') return undefined;
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return `${parsed.length} row(s)`;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      // PostgREST spells an error `{ message }`; the app's own RPCs answer `{ success, error }`.
      if (typeof obj.message === 'string') return obj.message;
      if (obj.success === false) return `refused: ${String(obj.error ?? 'unknown')}`;
      return Object.keys(obj).slice(0, 6).join(', ') || 'object';
    }
    return String(parsed);
  } catch {
    return undefined;
  }
}

export function createPostgrestFetch(options: PostgrestFetchOptions = {}): typeof fetch {
  const tables = options.tables ?? {};
  const transport = new MockTransport(options.fixtures ?? []);

  const motuFakeFetch = async function motuFakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = normalize(input, init);
    recordSeen();
    // LOGGED HERE, not in each handler, and for the same reason the handlers do their own
    // `recordReach`: this is the one place that sees both the request and the response it produced.
    // Attribution is read BEFORE awaiting — a fetch starts inside an island's window and resolves
    // long after it has closed, so asking afterwards credits everything to nobody.
    const by = ownerNow();
    const res = await dispatch(req);
    recordCall({
      target: targetOf(req, options.appRoutes ?? []),
      method: req.method,
      by,
      request: summarise(requestOf(req)),
      status: res.status,
      response: await responseOf(res),
    });
    return res;
  };

  const dispatch = async (req: ParsedRequest): Promise<Response> => {

    // BEFORE the baseUrl guard, deliberately: an application route is SAME-ORIGIN, so it never
    // matches the database origin and would otherwise be rejected as "outside baseUrl".
    if ((options.appRoutes ?? []).some((p) => req.path.startsWith(p))) return handleAppRoute(req, transport);

    if (options.baseUrl && !req.url.href.startsWith(options.baseUrl)) {
      recordUnscoped({ method: req.method, path: req.path, target: 'unparsed', reason: `origin outside baseUrl (${req.url.origin})` });
      return postgrestError(404, `motu: fake fetch has no baseUrl match for ${req.url.origin}`);
    }

    if (req.path.startsWith('/auth/v1/')) return handleAuth(req, options.auth);
    if (req.path.startsWith('/functions/v1/')) return handleFunction(req, transport);
    if (req.path.startsWith('/rest/v1/rpc/')) return handleRpc(req, transport);
    if (req.path.startsWith('/rest/v1/')) return handleRest(req, tables, transport);

    recordUnscoped({ method: req.method, path: req.path, target: 'unparsed', reason: 'path matches no known PostgREST/auth route' });
    return postgrestError(404, `motu: fake fetch does not recognize path ${req.path}`);
  };

  // STAMPED WITH WHAT IT CLAIMS, so `installFakeFetch(fake)` does not have to be told again.
  //
  // The two took `appRoutes` separately and a caller wrote it twice — and a divergence was silent in
  // both directions: a route the installer claimed but the fake did not fell into the `baseUrl` guard
  // and 404'd as unscoped; a route the fake claimed but the installer did not never reached it at all,
  // went to the dev server, and landed in `readUnansweredRequests()`. The fake is the one that KNOWS,
  // so it is the one that says.
  (motuFakeFetch as unknown as Record<symbol, WireClaims>)[WIRE_CLAIMS] = {
    appRoutes: options.appRoutes,
    baseUrl: options.baseUrl,
  };
  return motuFakeFetch;
}

/** What a fake answers for: the same-origin route prefixes, and the backend origin. */
export interface WireClaims {
  appRoutes?: string[];
  baseUrl?: string;
}

const WIRE_CLAIMS = Symbol.for('motu.wire.claims');

/** What `createPostgrestFetch` stamped on a fake — its own claim, not a second copy of it. */
export function fakeFetchClaims(fake: typeof fetch): WireClaims | undefined {
  return (fake as unknown as Record<symbol, WireClaims | undefined>)[WIRE_CLAIMS];
}

async function handleAuth(req: ParsedRequest, auth: PostgrestFetchOptions['auth']): Promise<Response> {
  if (req.path === '/auth/v1/user' && req.method === 'GET') {
    if (auth?.user !== undefined) return jsonResponse(auth.user, 200);
    recordUnscoped({ method: req.method, path: req.path, target: 'auth:getUser', reason: 'no `auth.user` declared' });
    return postgrestError(401, 'motu: fake fetch has no `auth.user` declared');
  }
  if (req.path === '/auth/v1/session' && req.method === 'GET') {
    if (auth?.session !== undefined) return jsonResponse(auth.session, 200);
    recordUnscoped({ method: req.method, path: req.path, target: 'auth:getSession', reason: 'no `auth.session` declared' });
    return postgrestError(401, 'motu: fake fetch has no `auth.session` declared');
  }
  recordUnscoped({ method: req.method, path: req.path, target: 'unparsed', reason: 'unrecognized auth route' });
  return postgrestError(404, `motu: fake fetch does not recognize auth route ${req.path}`);
}

/**
 * An EDGE FUNCTION (`supabase.functions.invoke`), which reaches here for free: the client hands its
 * `customFetch` to the functions client too, so an invoke is already flowing through this fake — it
 * was simply landing on an unrecognized path and being recorded as unscoped. A different protocol
 * from PostgREST (an opaque POST with a JSON body), and a different one in the ledger's vocabulary,
 * so it gets its own `data-reach` bucket rather than being folded in with `rpc`.
 */
async function handleFunction(req: ParsedRequest, transport: MockTransport): Promise<Response> {
  const fn = req.path.slice('/functions/v1/'.length);
  recordReach('function', fn);
  try {
    return jsonResponse(await transport.call(fn, 'invoke', [req.body]), 200);
  } catch (err) {
    return fromTransportError(err, { method: req.method, path: req.path, target: `function:${fn}` });
  }
}

/**
 * A SAME-ORIGIN APPLICATION ROUTE — a Next `app/api/**` handler and the like, called with a relative
 * url by ordinary `fetch`, never by the database client.
 *
 * This closes a gap `network-sealed` structurally cannot see: a relative request goes to the lagoon's
 * OWN origin, so it is loopback, so it is not an escape — it just 404s against the dev server, the
 * caller catches it, and an empty state renders. acme's announcement banner did exactly that. Routed
 * through the fixture layer, the same miss is an unscoped request and `fixture-coverage` says so.
 */
async function handleAppRoute(req: ParsedRequest, transport: MockTransport): Promise<Response> {
  recordReach('route', req.path, req.method);
  try {
    const result = await transport.call(req.path, req.method, [req.body, Object.fromEntries(req.url.searchParams)]);
    return jsonResponse(result, 200);
  } catch (err) {
    return fromTransportError(err, { method: req.method, path: req.path, target: `route:${req.path}` });
  }
}

async function handleRpc(req: ParsedRequest, transport: MockTransport): Promise<Response> {
  const fn = req.path.slice('/rest/v1/rpc/'.length);
  recordReach('rpc', fn);
  try {
    const result = await transport.call(fn, 'rpc', [req.body]);
    return jsonResponse(result, 200);
  } catch (err) {
    return fromTransportError(err, { method: req.method, path: req.path, target: `rpc:${fn}` });
  }
}

async function handleRest(req: ParsedRequest, tables: Record<string, PostgrestTable>, transport: MockTransport): Promise<Response> {
  const table = req.path.slice('/rest/v1/'.length).split('?')[0];
  const singular = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object');
  const wantsCount = (req.headers.get('prefer') ?? '').includes('count=');
  if (req.method === 'GET') {
    recordReach('table', table, 'select');
    // A read failure can be declared as a fixture (`{service: table, method: 'select', status,
    // after}`) WITHOUT needing a matching table row shape — checked first, same call-counting `after`
    // documented on `MockTransport`.
    try {
      const overridden = await transport.call(table, 'select', [Object.fromEntries(req.url.searchParams)]);
      if (overridden !== undefined) return jsonResponse(overridden, 200);
    } catch (err) {
      if (!isNoFixture(err)) return fromTransportError(err, { method: req.method, path: req.path, target: `table:${table}` });
      // no fixture override declared — fall through to the generic table engine below
    }

    const declared = tables[table];
    if (!declared) {
      recordUnscoped({ method: req.method, path: req.path, target: `table:${table}`, reason: 'no table declared and no read fixture' });
      return postgrestError(404, `motu: fake fetch has no table "${table}" declared`);
    }
    const rows = typeof declared.rows === 'function' ? declared.rows() : declared.rows;
    const filtered = applyFilters(rows, req.url.searchParams);
    if (filtered === null) {
      recordUnscoped({ method: req.method, path: req.path, target: `table:${table}`, reason: `unrecognized filter in ${req.url.search}` });
      return postgrestError(404, `motu: fake fetch does not understand a filter in ${req.url.search}`);
    }
    const ordered = applyOrder(filtered, req.url.searchParams.get('order'));
    const total = ordered.length;
    const limit = req.url.searchParams.has('limit') ? Number(req.url.searchParams.get('limit')) : undefined;
    const offset = Number(req.url.searchParams.get('offset') ?? '0');
    const paged = limit !== undefined ? ordered.slice(offset, offset + limit) : ordered.slice(offset);
    const projected = applySelect(paged, req.url.searchParams.get('select'));

    if (singular) {
      if (projected.length === 0) return jsonResponse(null, 200);
      return jsonResponse(projected[0], 200);
    }
    const headers: Record<string, string> = wantsCount
      ? { 'Content-Range': `${offset}-${offset + projected.length - 1}/${total}` }
      : {};
    return jsonResponse(projected, 200, headers);
  }

  // Writes: insert (POST), update (PATCH), delete (DELETE), upsert (POST + Prefer: resolution=...).
  const prefer = req.headers.get('prefer') ?? '';
  const isUpsert = req.method === 'POST' && prefer.includes('resolution=');
  const method = isUpsert ? 'upsert' : req.method === 'POST' ? 'insert' : req.method === 'PATCH' ? 'update' : req.method === 'DELETE' ? 'delete' : null;
  if (!method) {
    recordUnscoped({ method: req.method, path: req.path, target: `table:${table}`, reason: `unsupported HTTP method ${req.method}` });
    return postgrestError(405, `motu: fake fetch does not support ${req.method} on ${req.path}`);
  }
  // The semantic verb, not the HTTP one — `insert`/`update`/`upsert`/`delete` is the vocabulary
  // assay's ledger uses for a write, and the whole point of this record is to be comparable to it.
  recordReach('table', table, method);
  try {
    const result = await transport.call(table, method, [req.body, Object.fromEntries(req.url.searchParams)]);
    if (prefer.includes('return=minimal')) return new Response(null, { status: 204 });
    return jsonResponse(result, method === 'insert' ? 201 : 200);
  } catch (err) {
    return fromTransportError(err, { method: req.method, path: req.path, target: `table:${table}` });
  }
}

function isNoFixture(err: unknown): boolean {
  return err instanceof MotuError && err.status === 404 && err.message.startsWith('mock: no fixture for');
}

function fromTransportError(err: unknown, ctx: Omit<UnscopedRequest, 'reason'>): Response {
  if (err instanceof MotuError) {
    if (isNoFixture(err)) recordUnscoped({ ...ctx, reason: err.message });
    return postgrestError(err.status, err.message);
  }
  recordUnscoped({ ...ctx, reason: err instanceof Error ? err.message : String(err) });
  return postgrestError(500, 'motu: fake fetch fixture threw an unexpected error');
}

/**
 * Patch `globalThis.fetch` so requests the app makes DIRECTLY — not through the database client —
 * reach the fake too.
 *
 * Injecting `global: { fetch }` into `createClient` covers everything that client issues, which is
 * most of an app's backend traffic and all of its PostgREST and edge-function traffic. It does not
 * cover a service that calls `fetch('/api/…')` itself, because that is `window.fetch` and the client
 * was never involved. Those requests are same-origin, so they are invisible to `network-sealed` as
 * well: they 404 against the dev server, the caller catches it, an empty state renders, and every
 * check stays green.
 *
 * DELEGATES BY DEFAULT. Only paths the fake actually claims are intercepted; everything else — the
 * dev server's modules, HMR, assets, source maps — goes to the original `fetch` untouched. A lagoon
 * that cannot load its own bundle would be a far worse failure than an unanswered route, so the
 * narrow rule is the safe one.
 *
 * ONE PATCH, MANY FAKES. This used to guard on a global boolean, so the FIRST caller won and every
 * later one was a silent no-op — fine while a project had one region with a wire, and wrong the moment
 * it had two: the second region's routes went to the dev server, 404'd, its islands rendered empty and
 * nothing said why. Fakes now REGISTER, and the single patch asks each in turn what it claims.
 *
 * Idempotent per fake: installing the same one twice leaves one entry, so a hot reload does not build
 * a chain of patches or a chain of registrations.
 */
export function installFakeFetch(fake: typeof fetch, options?: WireClaims): void {
  // The fake's OWN stamp is the default, so the routes are declared once, where they are implemented.
  // An explicit `options` still wins — a caller wrapping someone else's fake has nowhere else to say.
  const claims = options ?? fakeFetchClaims(fake) ?? {};
  const registry = fakeRegistry();
  if (registry.some((entry) => entry.fake === fake)) return;
  registry.push({ fake, claims });
  armFakeFetch();
}

interface InstalledFake {
  fake: typeof fetch;
  claims: WireClaims;
}

function fakeRegistry(): InstalledFake[] {
  const g = globalThis as unknown as { __motuFakeFetches?: InstalledFake[] };
  return (g.__motuFakeFetches ??= []);
}

/** Every fake currently installed, in registration order — what a check reads to say who claimed what. */
export function installedFakeFetches(): readonly WireClaims[] {
  return fakeRegistry().map((entry) => entry.claims);
}

/** Forget every installed fake and leave the patch in place. For a test, or a lagoon remount. */
export function resetFakeFetches(): void {
  fakeRegistry().length = 0;
}

function claimedBy(url: URL): typeof fetch | undefined {
  for (const { fake, claims } of fakeRegistry()) {
    if (claims.baseUrl && url.href.startsWith(claims.baseUrl)) return fake;
    if ((claims.appRoutes ?? []).some((prefix) => url.pathname.startsWith(prefix))) return fake;
  }
  return undefined;
}

/**
 * Patch `globalThis.fetch` NOW, with whatever is registered — and whatever registers later.
 *
 * Worth being separate from `installFakeFetch` for one reason: a client that captures `globalThis.fetch`
 * at IMPORT time (`createClient(url, key, { global: { fetch } })` evaluated at module scope) keeps
 * whatever `fetch` was when its module ran. If the fakes are declared rather than installed by a
 * top-level side effect, that capture can happen first and the client talks past every fake, silently.
 * Calling this at the top of the lagoon entry — before any application module is imported — closes it:
 * the patch is in place from the start and the registry fills in behind it.
 */
export function armFakeFetch(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g.__motuFakeFetchArmed) return;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      const raw = input instanceof Request ? input.url : String(input);
      url = new URL(raw, typeof location !== 'undefined' ? location.href : 'http://localhost');
    } catch {
      return original(input as RequestInfo, init);
    }
    const fake = claimedBy(url);
    if (fake) return fake(input, init);
    // DELEGATED, AND THEN WATCHED. Everything no fake claims goes to the real fetch, which in a lagoon
    // is the dev server — and that is right for the dev server's own traffic. It is also where an
    // unstubbed APP route goes: it 404s, the caller catches it, an empty state renders, and nothing
    // says so. `network-sealed` cannot see it either, because it only counts requests that left for a
    // non-loopback host.
    //
    // The signal is not "a same-origin 404" — favicons and source maps 404 all day. It is a request
    // the app made, that NO STUB CLAIMED, whose real answer was an error. Recorded, not blocked: the
    // page still gets the response it would have got.
    const res = await original(input as RequestInfo, init);
    // NOT JUST `!res.ok`. A Vite dev server answers an unknown path with its SPA fallback — 200, and
    // `index.html` — so an unstubbed API route comes back "successful" and the caller fails later
    // trying to read JSON out of a web page. That was this gap's real shape: the first attempt looked
    // for a 404 and found none. An HTML answer to a request the app made with `fetch` is the
    // signature, because the dev server's own traffic (modules, css, source maps) is never HTML.
    const html = (res.headers.get('content-type') ?? '').includes('text/html');
    if (!res.ok || html) {
      const g2 = globalThis as unknown as { __motuUnansweredRequests?: { method: string; url: string; status: number; why: string }[] };
      (g2.__motuUnansweredRequests ??= []).push({
        method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
        url: url.pathname + url.search,
        status: res.status,
        why: html ? 'answered with the dev server\'s HTML fallback, not data' : `HTTP ${res.status}`,
      });
    }
    return res;
  };
  g.__motuFakeFetchArmed = true;
}
