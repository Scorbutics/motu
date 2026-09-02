# Contract and backend — how an island gets data

An island never fetches. It calls a contract, and a **transport** — chosen once, at a composition
root, by code the island cannot see — decides how that call leaves the process. This page is the
whole seam: the four transports that exist, where the choice is made and what it costs in security,
the source/port/adapter distinction that decides how much a green lagoon actually claims, the
generated artifacts (`@motu/contract`, `contracts.generated.ts`) and which command produces which,
where a fake goes when you mock at the wire rather than swapping a module, how fixtures are recorded
and replayed, and what the `java/` subtree is for.

---

## 1. The seam

Everything funnels through one function.

```ts
/** The single entry point the generated contract uses. Fails loudly if not configured. */
export function call<T>(service: string, method: string, args: unknown[]): Promise<T> {
  if (!current) {
    throw new Error('motu: configure() was not called before a service call');
  }
```

`packages/runtime/src/index.ts:99-104`. `current` is a module-level `Transport | null`
(`packages/runtime/src/index.ts:17`), set by `configure()` (`packages/runtime/src/index.ts:20-22`).
The interface is three words wide:

```ts
export interface Transport {
  call<T>(service: string, method: string, args: unknown[]): Promise<T>;
}
```

`packages/runtime/src/index.ts:13-15`.

**The rule: all island I/O goes through the contract.** The failure it prevents is an island that
cannot be mounted anywhere but production. `motu island verify` enforces it as three separate check
ids:

| check id | what it rejects | source |
|---|---|---|
| `no-bare-fetch` | `fetch(...)` and `XMLHttpRequest` in an island's component graph | `packages/cli/src/commands/verify.mjs:151-162` |
| `contract-only-io` | importing `axios`/`ky`/`superagent`/`node-fetch`/`got`, or importing `configure` / `HttpTransport` / `MockTransport` from `@motu/runtime` | `packages/cli/src/commands/verify.mjs:190-206` |
| `contract-only-io` (second half) | calling a `service.method` that does not exist in the generated contract | `packages/cli/src/commands/verify.mjs:222-240`, resolved against `paths.contract` by `contractPairs()` at `verify.mjs:517-523` |

Note what `contract-only-io` bans: an island may not import `configure` or a transport class *at
all*. The transport is not the island's business, and the check makes that structural rather than
cultural.

Because there is exactly one choke point, it is also the natural place to observe and to record. Both
are `DEBUG`-gated and dead-code-eliminated in production
(`packages/runtime/src/index.ts:6-7`, `104`):

- **observation** — `observeCalls()` emits a `CallEvent` at start and again at completion, carrying
  the island the call was attributed to (`packages/runtime/src/index.ts:31-56`, `106-132`).
  Attribution is captured *synchronously at call entry* from the ambient island window in
  `@motu/core`, so a call that fails later still belongs to the right island
  (`packages/runtime/src/index.ts:26-28`, `47-50`).
- **recording** — `startRecording()` / `stopRecording()` keep the **response body**, which `CallEvent`
  deliberately does not (`packages/runtime/src/index.ts:71-97`). In debug builds the pair is exposed
  on the page as `globalThis.__motuRecorder` so the CLI can drive it through a browser
  (`packages/runtime/src/index.ts:135-142`).

Errors are normalised at the seam too: `MotuError` carries a status
(`packages/runtime/src/index.ts:144-149`) and `SessionExpiredError` is the 401 case
(`packages/runtime/src/index.ts:151-156`).

---

## 2. Every transport that exists

There are **four** implementations of `Transport` in the repo, and no others
(`grep -rn "implements Transport" packages`):

| Transport | Module | Where it runs | What it does |
|---|---|---|---|
| `DirectTransport(services)` | `packages/runtime/src/direct-transport.ts:27` | the host page | Calls the app's own service functions **in this process**. No network hop, no second client. |
| `HttpTransport(base, opts)` | `packages/runtime/src/http-transport.ts:28` | the host page | `POST <base>/<service>/<method>` with the args as a JSON array body. Default base `/rest/motu`. |
| `MockTransport(fixtures, roles)` | `packages/runtime/src/mock.ts:157` | the lagoon, `island verify` | Replays fixtures, request-keyed. No backend, no session, no login. |
| `FailingTransport(status)` | `packages/runtime/src/mock.ts:198` | `island verify`, the lagoon's forced-error state | Fails **every** call with one fixed status. |

`MockTransport` and `FailingTransport` live behind the `@motu/runtime/mock` subpath export
(`packages/runtime/package.json:12-15`) so a production bundle never has to reach them.

### `HttpTransport`

```ts
const res = await fetch(`${this.base}/${service}/${method}`, {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(xsrf ? { [this.xsrfHeaderName]: xsrf } : {}),
  },
  body: JSON.stringify(args),
});
```

`packages/runtime/src/http-transport.ts:50-59`. Options are the XSRF cookie/header names and a
session-lost callback (`HttpTransportOptions`, `http-transport.ts:20-26`); defaults are
`XSRF-TOKEN` → `X-XSRF-TOKEN` and a redirect to `/login?returnUrl=…`
(`http-transport.ts:37-44`). Two failure shapes are handled: an explicit 401
(`http-transport.ts:61-64`), and a legacy `302 → login HTML` that `fetch` followed transparently,
caught by requiring a JSON content-type (`http-transport.ts:66-71`). Anything else non-OK becomes a
`MotuError` with the response text (`http-transport.ts:73-75`).

### `MockTransport` and request keying

A fixture names a `service` and `method`, optionally `roles`, and optionally `match`
(`packages/runtime/src/mock.ts:9-24`). Resolution order:

```ts
const fixture =
  candidates.find((f) => f.match && argsMatch(f.match, args)) ?? candidates.find((f) => !f.match);
```

`packages/runtime/src/mock.ts:172-174` — a request-keyed fixture wins over the request-agnostic
fallback. `match` is structural: an `undefined` slot is a wildcard, and a plain object matches as a
**subset**, so you pin only the fields you care about (`mock.ts:133-148`). `[undefined, { login:
'brice' }]` matches any page with that login criterion.

`Fixture` is a **union**, not an optional status (`mock.ts:64-71`):

- `FixtureResponse` (`mock.ts:27-36`) — a fixed value (static replay), or a `FixtureResponder`
  function of the args. A function is an explicit **client-side stub**, not a claim of backend
  fidelity; it exists so a search box actually narrows results in the lagoon for any typed input
  (`mock.ts:3-5`, `28-33`, and the resolution at `mock.ts:186-189`).
- `FixtureFailure` (`mock.ts:56-62`) — a declared status, thrown as a `MotuError` exactly as the real
  transport throws, so the island takes the same code path it will take in production, not a special
  "mock is sad" path (`mock.ts:181-184`).

The union is deliberate: "a fixture that carries both a response and a status is a fixture whose
author did not decide, and the compiler says so at the point of writing" (`mock.ts:64-70`).

`roles` gate a call: a fixture whose roles the currently selected role set does not satisfy throws
403 (`mock.ts:178-180`), so authorization behaviour is demonstrable with no server running. An
unknown service/method is 404 (`mock.ts:168-171`).

### Where the choice is made

**Once, at a composition root.** Three roots exist in practice.

**The host page (React / Next).** `createRegion` calls `configure` at module scope:

```ts
// Module scope on purpose: a transport is a property of this composition root, not of a render.
if (opts.transport) configure(opts.transport);
```

`packages/react/src/create-region.tsx:101-102`, with `transport?: Transport` on the options at
`create-region.tsx:37`. In an adopting project that is one line in one file:

```tsx
export const Club = createRegion(clubArchipelago, {
  elements: ELEMENT_REGISTRY,
  transport: new DirectTransport(services),
  useHost: () => nextHostBridge(useRouter()),
});
```

`peps:components/motu/club-region.tsx:25-34`. Every region file in
that project makes the same choice deliberately — "environment choices this application already made
once, and answering them differently by accident is how two regions end up with two securities"
(`club-region.tsx:8-10`).

**The lagoon gallery.** `startLagoon` resolves a mode and wires it
(`packages/react/src/lagoon-gallery.ts:184-194`):

```ts
const mode = resolveTransportMode(typeof opts.transport === 'string' ? opts.transport : config.transport ?? '');
const custom = overrides.transportFor?.(mode);
if (custom) configure(custom);
else if (mode === 'http' && config.httpBase) configure(new HttpTransport(config.httpBase));
else configure(new MockTransport(opts.fixtures ?? [], opts.roles ?? []));
```

`resolveTransportMode` reads, most specific first: `?transport=http|mock` in the URL → localStorage
`motu:transport` → the build default → `mock` (`packages/react/src/transport-toggle.ts:16-40`). The
build default is `__MOTU_TRANSPORT__`, injected from the `MOTU_TRANSPORT` env var
(`packages/cli/src/lib/lagoon-vite.mjs:273`, `packages/cli/src/lib/scaffold.mjs:383`, `398`, `475`);
`motu lagoon` sets it to `'mock'` (`packages/cli/src/commands/lagoon.mjs:83`). A chip in the toolbar
flips it in the browser and reloads (`transport-toggle.ts:42-56`); HTTP wears the caution colour
because "HTTP means real backend + real session, which is the state worth noticing"
(`transport-toggle.ts:54-55`).

**The focused lagoon** — the entry every check drives — never negotiates:

```ts
configure(
  opts.forceErrorStatus
    ? new FailingTransport(opts.forceErrorStatus)
    : new MockTransport(opts.fixtures ?? [], opts.roles ?? []),
);
```

`packages/react/src/lagoon-bootstrap.ts:285-289`, and the same choice again in the re-aim harness at
`lagoon-bootstrap.ts:123-127`, where "the transport is part of what is being asked for: 'the same
island, but the backend fails'". The headless harness used by `island verify` does the same
(`packages/cli/src/runtime-harness.mjs:82`, `105`).

### The trade — the most important thing on this page

`DirectTransport` calls the app's own functions **in the browser, with the user's session**:

```ts
async call<T>(service: string, method: string, args: unknown[]): Promise<T> {
  if (!Object.prototype.hasOwnProperty.call(this.services, service)) {
    throw new MotuError(404, `motu: no such service '${service}'`);
  }
```

`packages/runtime/src/direct-transport.ts:30-44`. Own-property lookups only — "a plain index would
resolve `'constructor'` or `'__proto__'` and hand back something that was never an exposed method.
Deny-by-default has to mean the map, exactly" (`direct-transport.ts:31-32`).

**The consequence: authorization is untouched.** The functions in the map are the app's own, and
whatever they already use — a session-bound client, row-level security, an existing `@Roles`
interceptor — decides what the caller may see. "motu adds no credential and can widen nothing"
(`direct-transport.ts:18-20`; the same sentence in the adopting project at
`peps:motu/src/services/index.ts:11-13`).

`HttpTransport` exists because the Jakarta ocean keeps data access on the server, where the browser
cannot reach it without a request. **That is not universal.** What motu needs is not a network
boundary but a single seam, and forcing a row-level-security app through an HTTP tier it does not
otherwise have "would add a hop, a second client, and a place for authorization to be reimplemented
differently" (`direct-transport.ts:7-16`).

**And the lagoon makes the opposite choice, deliberately.** `MockTransport` answers with no session,
no credential and no backend — every authorization decision the real path would make is *absent*, and
the fixture is whatever a human wrote. A green lagoon therefore says nothing about who may see what.
The two claims do not overlap:

| | production (`DirectTransport`) | lagoon (`MockTransport`) |
|---|---|---|
| who decides what comes back | the app's own data-access rules, holding the user's session | the fixture author |
| what a pass proves | the real rules ran | the island renders correctly *given* an answer |
| role gating | the app's, unchanged | `fixture.roles` vs. the selected role set (`mock.ts:178-180`) — a demo of the behaviour, not the behaviour |

That is the whole point of the seam, and also its exact limit. §3 is where that limit is named.

### The server-side variant

When the work genuinely must run on a server (a service-role key, a secret), `@motu/adapter-next`
ships a route handler whose URL shape *is* `HttpTransport`'s, so no Next-specific transport is needed
(`packages/adapters/next/src/server.ts:44-91`):

```ts
// app/api/motu/[...call]/route.ts
import { createMotuRoute } from '@motu/adapter-next/server'
import { services } from '@/motu/server/services'
export const { POST } = createMotuRoute(services)
export const dynamic = 'force-dynamic'
```

`createMotuRoute` (`server.ts:44-92`) does the same own-property lookup
(`server.ts:50-56`), rejects a non-array body with 400 (`server.ts:69-77`), and answers 404 for
an unknown pair, "indistinguishable from an unknown URL: deny-by-default leaks nothing"
(`server.ts:24-27`). Its `authorize` hook (`server.ts:12-17`) is **a coarse early exit, not the
security boundary** — the comment says so twice (`server.ts:8-9`, `:14-15`), and it answers 401
rather than 403 because existence is already established by that point (`server.ts:65-66`).

---

## 3. SOURCE vs PORT vs ADAPTER

`.github/host-rules.md:361-385` makes a distinction that decides how much a green region actually
claims, and it is routinely read backwards.

- **The source is REAL in the lagoon.** "When a flow runs, the source is the APPLICATION'S OWN
  OBJECT. Its timeout, its precedence rules, its generation guard, its error mapping, its intent
  dispatch — all of that executes" (`.github/host-rules.md:363-366`). In the adopting project the
  source is `createDirectorySource` — debounce, page-one reset, append-on-more, and a `generation`
  counter so a slow first request cannot land after a faster second one
  (`peps:app/dashboard/directory/directory-source.ts:56-64`). It owns
  no framework and no motu, "so it runs in a React effect, in a motu channel, and in a vitest test
  with three lines of setup" (`directory-source.ts:9-10`).
- **The PORT is the stand-in.** "production hands it Supabase and the services, the lagoon hands it
  fixtures" (`host-rules.md:366-367`). The port is a declared interface —
  `DirectoryPort { search, counts }` (`directory-source.ts:23-26`). The page passes the real services
  (`peps:app/dashboard/directory/page.tsx:56-58`); the lagoon passes fixture functions through
  `channelFrom` (`motu/roots/lagoon/src/regions/directory.tsx:37-48`). The archipelago names the
  source itself, by import, not by string (`motu/src/archipelagos/directory/directory.archipelago.ts:97-99`),
  and `RegionSourcesOk` makes a host-fed key with no declared producer a build error
  (`directory.archipelago.ts:120-122`).
- **The ADAPTER is what you still have to prove.** What a flow "CANNOT prove is the seam on the other
  side of the port: that the real adapter … matches what the backend actually sends. Get that shape
  wrong and every motu check stays green while production breaks. The lagoon replaces the host module
  so completely that nothing shows a fetch happened — that is the point of it, and it is the
  boundary" (`host-rules.md:369-374`).

**So a source that carries logic gets unit tests, in the host's own runner, over a hand-made port**
(`host-rules.md:376-381`) — that is the only place branches no rendered state distinguishes can be
reached: a lookup that *threw* versus one that answered null, a deadline, the slower of two submits
not overwriting the faster. **No check enforces this.** A `sources-tested` warning used to name each
declared source no test file mentioned, and it was removed: whether the application's own code has
unit tests is not motu's judgement to make, nothing else in the framework opines on a host's test
suite, and it could only fire once a source already existed — so it encouraged testing an extraction,
never the extraction itself. What produces the pattern is structural, not a check: the lagoon renders
a region without the page, so orchestration hidden in page effects cannot be previewed at all.

The known gap, stated rather than hidden: a client that talks to the database or the auth service
directly is not a declared operation, so no tool pins its shape — "that adapter is the last unproven
inch of this design. It is a few lines by construction, which is the mitigation"
(`host-rules.md:396-400`).

### The related trap: a stub that stopped mirroring

The lagoon's `alias` table swaps whole host modules for stubs
(`peps:motu/roots/lagoon/lagoon.config.json`, the `alias` block).
Nothing used to check that a stub still stands in for all of it: "in peps, two exports went missing
from stubs and only surfaced because the lagoon BUILD happened to import them — a bundler error, by
luck" (`packages/cli/src/lib/stubs.mjs:3-7`). `stubParity()` walks the import graph from each island's
component and compares each stub against **what the islands actually reach for** — not the module's
whole surface, which would be noise (`stubs.mjs:9-12`, `59-94`, `102-113`). It reports as the
`host-stubs` check id (`packages/cli/src/commands/verify.mjs:2494-2512`). Type-only imports are
exempt (`stubs.mjs:50-51`).

`stubParity` keeps a module swap honest; §4 is the other answer to the same problem — do not swap the
module at all, and fake one layer below it, where the app's own logic still runs.

---

## 4. Mocking at the WIRE — `@motu/runtime/postgrest-fetch`

A lagoon stub replaces a whole service module by hand, which means the module's OWN logic — the
orchestration, the derived visibility rules, the period maths, whatever the real function does beyond
"read a table" — never runs in the lagoon at all. Nobody notices, because there is nothing to notice:
the swap is silent by construction.

`createPostgrestFetch` moves that boundary one layer down. It returns a fake `fetch`, PostgREST-shaped,
for injecting where the application builds its database client
(`packages/runtime/src/postgrest-fetch.ts:342`):

```ts
import { createPostgrestFetch, installFakeFetch } from '@motu/runtime/postgrest-fetch';

const fetch = createPostgrestFetch({
  baseUrl: 'https://project.supabase.co',
  tables: { shots: { rows: () => shotRows() } },
  fixtures: [{ service: 'accept_shots', method: 'rpc', status: 500, after: 2 }],
  appRoutes: ['/api/admin'],
});
createClient(url, key, { global: { fetch } });   // or createBrowserClient — same option
installFakeFetch(fetch, { appRoutes: ['/api/admin'], baseUrl });
```

Every repository and service function then runs FOR REAL — in the lagoon, in a runtime check, under
Playwright — answered by synthetic DATA instead of synthetic LOGIC. `tables[].rows` may be a function
so a scenario's seed can change what a read returns, and it is called fresh on every GET: a table
computed once at import would answer every later scenario with the first one's seed
(`postgrest-fetch.ts:25-36`).

**It is deliberately not a PostgREST clone.** It supports the operators a real project's client code
was found to use — `eq`, `is`, `gte`, `lt`, `in`, `not.is.null`, a two-clause `or=`, `order`,
`limit`/`offset`, `select` as flat columns/`*`/one embed shape, `.single()`/`.maybeSingle()` via
`Accept: vnd.pgrst.object+json`, `count=exact`, writes with `Prefer: return=…`, and `rpc`. Anything
outside that set is an **UNSCOPED REQUEST**, recorded and reported, never a silent wrong answer
(`postgrest-fetch.ts:16-22`, `:68-101`). The fixture author is meant to notice and extend the fake,
not have it guess.

`installFakeFetch` patches `globalThis.fetch` for what the database client never sees — a service
calling `fetch('/api/…')` itself. It **delegates by default**, claiming only `baseUrl` and declared
`appRoutes` and passing everything else to the original: intercepting every same-origin request would
swallow the dev server's own modules, HMR and source maps, "and a lagoon that cannot load its own
bundle would be a far worse failure than an unanswered route" (`postgrest-fetch.ts:509-546`). It is
idempotent, so a hot reload does not build a chain of patches.

`Fixture.after` exists for this seam: a fixture applies from the Nth call on. Matching was by ARGUMENTS
only, so "the first read succeeds, a later one fails" had no fixture to write — a refetch usually
repeats the same arguments and only the ORDER differs (`packages/runtime/src/mock.ts:30-41`).

**Three checks watch the seam**, and they are [07 — Checks and
verification](07-checks-and-verification.md)'s to define: `fixture-coverage` (every request matched a
declared table or fixture), `network-sealed` (nothing left the machine — invisible before, because a
missing stub failed, the island caught it, an empty state rendered and every check stayed green), and
`data-reach` (the tables, RPCs, functions and routes an island actually touched).

`data-reach` is the replacement for something wire mocking took away. When each service module was
stood down BY NAME, an island's `effects` said `@/lib/services/challenges` and you could read its data
dependency off the contract. Now the service runs for real and only the database client is stood down,
several modules below the component, so the module half of `effects` — direct imports — can no longer see it.
The dependency did not disappear; it stopped being legible. A table-and-RPC list is strictly better
than what it replaces: it is what the island actually needs, at the granularity assay's
`.assay/operations.json` already speaks (`postgrest-fetch.ts:111-151`).

> **No project in this repository uses it yet.** It was built against a real adopting project's
> PostgREST surface, and its own suite covers it (`packages/runtime/test/postgrest-fetch.test.mjs`,
> 32 assertions; `mock-fixture-after.test.mjs`, 8). motu's own hosts talk to their backend through
> other seams, so the in-tree consumer that would keep it honest does not exist — worth knowing when
> reading the support matrix above as if it were exhaustive.

---

## 5. Two things are called "contract" — which is which

| artifact | what it describes | produced by | committed? |
|---|---|---|---|
| `@motu/contract` (`<app>/contract/src/index.ts`) | the **backend's callable surface**, as typed TS functions over `call()` | `motu codegen` from `motu-manifest.json` (Jakarta hosts) — or, on a TS host, hand-written as `createContract<AppServices>()` with no generator at all | yes |
| `contracts.generated.ts` (in `islands/`) | each **island's** boundary: `input`, `output`, `effects`, read from the component it mounts | `motu island sync` → `syncContracts()` (`packages/cli/src/lib/contracts.mjs:177-184`) | yes |

`motu check` gates *drift* of `contracts.generated.ts` against the components
(`packages/cli/src/commands/check.mjs:26-31`, using `contractsDrift()` at
`packages/cli/src/lib/contracts.mjs:186-192`). A stale `contracts.generated.ts` is *also* a compile
error: the file emits a
`ContractFitsComponent<...>` assertion per island whose failure message is `'contract is stale — run
motu island sync; the component has no such prop:'` (`contracts.mjs:136-154`).

`contracts.generated.ts` is derived, never authored: "Each island's boundary, READ from the component
it mounts… Editing the component changes this file; editing this file changes nothing"
(`contracts.mjs:116-121`). The one part that *is* a decision — an event whose region name differs from
the callback's — is declared in the island file as `island(tag, Component, { events: { onProgress:
'week-progress' } })` and baked in (`contracts.mjs:122-124`, applied at `contracts.mjs:164-173`). An
override for a callback the component does not have is deliberately kept out of the generated map so
`RegionWiringOk` reports it instead of blessing it (`contracts.mjs:72-73`).

---

## 6. Codegen — `motu-manifest.json` → `@motu/contract`

```
motu codegen [manifest] [outDir]
```

`packages/cli/src/run.mjs:87`, dispatched at `run.mjs:297-300`. Defaults are
`paths.defaultManifest` and `paths.contractSrcDir` (`packages/cli/src/commands/codegen.mjs:9-10`) —
i.e. `motu.config.json`'s `manifest` key, default `target/motu-manifest.json` relative to the project
root (`packages/cli/src/lib/config.mjs:72-76`, `:337`). A missing manifest is a hard error with the
remedy printed: *"build the backend so `dev.motu:apt` emits `motu-manifest.json`, or pass an explicit
path"* (`codegen.mjs:12-16`). The command is a thin wrapper that spawns
`packages/codegen/src/cli.mjs` (`codegen.mjs:18-19`), so the same generation is reachable from the one
`motu` entry point.

The generator is 43 lines (`packages/codegen/src/cli.mjs`). Per service, per method
(`cli.mjs:26-36`):

```js
body += `  ${m.name}: (${params}) =>\n`;
body += `    call<${m.returns}>('${service.name}', '${m.name}', [${argList}]),\n`;
```

and one `__roles` map of `Service.method → string[]` (`cli.mjs:33`, `38`). Output is a single
`index.ts` under the out dir, headed `// GENERATED by @motu/codegen from motu-manifest.json — do not
edit.` (`cli.mjs:19-21`, `40-42`). The real thing:

```ts
export const MemberService = {
  search: (page: number, parameters: Record<string, unknown>) =>
    call<{ list: Record<string, unknown>[]; first: string; perPage: string; size: string }>('MemberService', 'search', [page, parameters]),
};
```

`demo-app/contract/src/index.ts:4-7`, with `__roles` at `demo-app/contract/src/index.ts:14-21`. The
package is plain source, `main`/`types` pointing at `src/index.ts`
(`demo-app/contract/package.json`).

**When you regenerate:** whenever the backend's callable surface changes shape — a signature, a return
type, an added or removed `@BrowserCallable`, a changed `@Roles`. "A Java signature or `@Roles` change
reshapes the TypeScript (and breaks `tsc`) instead of drifting" (`packages/codegen/src/cli.mjs:5-6`).
The safety net is that failure mode, not a deploy-time gate (`README.md`, "Backend").

**Generated vs hand-written:**

| generated | hand-written |
|---|---|
| every `Service.method` wrapper and its types | the `@BrowserCallable` annotations that decide the surface |
| `__roles` | fixtures (`fixtures.mock.ts`), scenarios, roles |
| `contracts.generated.ts` (`motu island sync`) | the island file's `tag`, `component`, and event-name overrides |

**On a TypeScript host there is no codegen at all.** "The Java seam needs an annotation processor
because it has to DISCOVER which methods are callable across a whole compiled codebase. TypeScript
needs no such thing: the callable surface is an object literal the app writes, and its type IS the
contract" (`packages/adapters/next/src/contract.ts:3-6`). `defineServices` is identity at runtime and
exists only to fix the type (`packages/adapters/next/src/services.ts:38-40`); `createContract<S>()`
returns a lazy two-level Proxy that turns `contract.directory.getSectors(…)` into
`call('directory', 'getSectors', args)` (`contract.ts:33-53`). Non-string property reads return
`undefined` so "a bundler probing for `then`" is not mistaken for a service name (`contract.ts:39-41`).
That is strictly better here: "there is no regeneration step to forget, and a signature change fails
`tsc` at the call site immediately rather than after someone re-runs a generator"
(`contract.ts:7-8`).

---

## 7. Fixtures — `motu fixtures record`

```
motu fixtures record <island> [--transport http|mock] [--out <path>]
```

`packages/cli/src/run.mjs:75`, usage line at `packages/cli/src/commands/fixtures.mjs:44`.

**What it does.** Boots the focused lagoon on that island, drives the island's declared `scenarios`
through the archipelago boundary, and records each contract call's request **and** response at the
`call()` seam (`fixtures.mjs:1-7`). Mechanically
(`packages/cli/src/playwright-lagoon.mjs:1347-1408`):

1. an init script polls for `window.__motuRecorder` and starts it *before* the island's mount fetch,
   so the default request is captured too (`playwright-lagoon.mjs:1354-1362`);
2. it waits for the island to upgrade and paint (`playwright-lagoon.mjs:1364-1381`);
3. for each scenario it first `provide()`s a **sentinel** value for the scenario's keys, then the real
   seed — because a scenario equal to the current store (the empty default) would not re-fetch on its
   own, and the change makes the request deterministic (`playwright-lagoon.mjs:1383-1402`). Sentinel
   calls are filtered out afterwards (`playwright-lagoon.mjs:1406-1407`).

**Preconditions.** No `scenarios` export in `fixtures.mock.ts` → hard error, exit 1
(`fixtures.mjs:49-53`). The island failing to mount → `island did not mount — nothing recorded`
(`fixtures.mjs:71-74`). Nothing captured at all (no calls, no host-fed writes) → exit 1
(`fixtures.mjs:96-99`). Missing Chromium is detected and reported with the install command
(`fixtures.mjs:64-66`).

**`--transport http` is the point of it.** It records the **real backend**; the default records the
mock, which is a self-consistency check of the pipeline (`fixtures.mjs:4-6`, `55`). The flag is passed
through to the lagoon process as the `MOTU_TRANSPORT` env var
(`packages/cli/src/playwright-lagoon.mjs:216`).

**Output.** Calls are deduped by `(service, method, args)` with key ordering stabilised
(`fixtures.mjs:32-39`, `76-84`), and written to `<islandDir>/fixtures.recorded.ts` unless `--out`
(`fixtures.mjs:101-102`). Each row is **request-keyed** — `match` is the exact call args:

```ts
{ service: "directory", method: "getSectors", match: [...], response: { … } },
```

`fixtures.mjs:121-133`. A captured failure is now a real fixture row (`status: 500`), not a comment:
this used to emit `response: null` with the status commented out, "because `Fixture` could not express
a failing call — so recording a real 500 through `--transport http` produced something nobody could
run" (`fixtures.mjs:124-129`, and the type that fixed it, `packages/runtime/src/mock.ts:38-55`).

Host-fed store writes (channels + `provide`) are reduced to a last-wins `seed` export, **minus** the
keys the scenarios themselves drove — those are inputs, not host config (`fixtures.mjs:86-94`,
`134-137`).

**Recording does not install anything.** The file is named `fixtures.recorded.ts` and the command
ends with: *"Review, then merge into `fixtures.mock.ts` (fixtures) and the lagoon seed (seed) to
replay this session offline."* (`fixtures.mjs:108`).

**Replay in the lagoon.** The merged `fixtures.mock.ts` exports `fixtures`, `roles` and optionally
`scenarios` (the scaffold at `packages/cli/src/commands/create.mjs:109-135`); the project aggregates
every island's into one array the lagoon roots mount (`demo-app/src/fixtures.ts:1-14`), and
`MockTransport` replays them.

**When a fixture goes stale.** There is no staleness check — the tool cannot know. What it can tell
you, and the three signals to read:

- the shape changed → `tsc` fails where the contract's return type is consumed (the codegen/`tsc`
  loop, `packages/codegen/src/cli.mjs:5-6`);
- the *method* went away → `contract-only-io` errors on a call not in the generated contract
  (`packages/cli/src/commands/verify.mjs:222-240`);

What none of them catch is a fixture whose *values* no longer resemble the backend's. That is the
adapter gap of §3, and re-running `motu fixtures record --transport http` against the real backend is
the cheap way to answer it.

A function `response` never goes stale — and that is the warning, not the feature. It is a
client-side stub written to make the island's reactive behaviour verifiable offline, "explicitly a
stub for verifying the ISLAND's wiring", not backend fidelity (`packages/runtime/src/mock.ts:3-5`,
`28-33`). The demo project's `matchesCriteria` is exactly that, and says so
(`demo-app/src/islands/member-results/fixtures.mock.ts:46-48`). Use a value, or a request-keyed
`match`, for recorded truth.

---

## 8. The JVM side — `java/`

**What it is.** Two Maven modules under `java/`, aggregated by `java/pom.xml`, groupId `dev.motu`,
version `0.1.0-SNAPSHOT`:

| module | artifact | job |
|---|---|---|
| `java/apt` | `dev.motu:apt` | a compile-time annotation processor that emits `motu-manifest.json` |
| `java/endpoint` | `dev.motu:endpoint` | a JAX-RS/CDI dispatcher (`/motu/{service}/{method}`) plus a classpath asset endpoint for `bridge.js` |

They are **generic JavaEE tooling — they know nothing about any particular ocean** — and neither
depends on the other, deliberately: "a host can generate the manifest at build time without deploying
the runtime, and deploy the runtime without running the processor" (`java/pom.xml`, the header
comment). The aggregator "is not a parent: neither module inherits from it, so each still builds
standalone". The same comment explains the directory: `packages/` is the pnpm workspace root and a
Maven subtree inside it "would make the word mean two things".

**`dev.motu:apt`.** `MotuManifestProcessor` scans `@BrowserCallable`
(`java/apt/src/main/java/dev/motu/apt/MotuManifestProcessor.java:41-43`). Class-level exposes all
public non-static methods *unless* the class also uses method-level annotations, in which case those
are authoritative and match `MotuRegistry` (`MotuManifestProcessor.java:70-91`, `93-101`). It maps
Java types to TypeScript (`MotuManifestProcessor.java:178-257`) — `long` → `string` because it is
"lossy in JS number space" (`:190-191`), `Optional<T>` → `T | null` (`:229-230`), an enum → a union of
string literals (`:242-250`), an unexpandable DTO → `Record<string, unknown>` so the generated
contract still compiles while runtime binding deserializes the real object server-side (`:252-255`).
It also extracts the host's `@Roles` enum constants (`:142-176`). It is **dependency-free by design**:
motu and host annotations are resolved by fully-qualified name, so it couples to neither
`dev.motu:endpoint` nor the host application (`MotuManifestProcessor.java:37-39`, `java/apt/pom.xml`).
The manifest is written once, at `processingOver()`, to `CLASS_OUTPUT/motu-manifest.json`
(`:64-67`, `:292-299`).

**`dev.motu:endpoint`.** `MotuEndpoint` is the browser-facing `POST /motu/{service}/{method}`
(`java/endpoint/src/main/java/dev/motu/runtime/MotuEndpoint.java:35-48`) — the same URL shape
`HttpTransport` produces. Its whole thesis is in one comment: motu resolves the bean as a **CDI
contextual reference**, not with `new`, so the host's `@Roles` / `RolesInterceptor` chain fires
unchanged, and motu only translates that pre-existing decision into an HTTP status
(`MotuEndpoint.java:19-27`, `65-76`). An `IllegalAccessError` from the interceptor becomes 403 with
the interceptor's own message echoed "to make the provenance auditable" (`:81-89`); a business
exception becomes a bare 500 without leaking internals (`:90-91`). It **returns** `Response` objects
rather than throwing, because the host app's greedy `ExceptionMapper<Throwable>` would otherwise
rewrap everything into a 500 and erase the status semantics (`:29-33`).

`MotuRegistry` (`java/endpoint/src/main/java/dev/motu/runtime/MotuRegistry.java`) discovers the beans
lazily (`:199-210`) and is "the only place motu reflects, and it never reflects on arbitrary client
input — an unknown service or method is a 404, never a probe" (`:22-24`, `:193-206`). It resolves
the BeanManager through JNDI `java:comp/BeanManager` rather than injection, because motu-runtime lives
in the EAR's shared `lib` and an injected BeanManager "cannot see beans defined inside a WAR"
(`:25-31`, `:78-91`). Argument binding is positional into the method's parameter types; an arity
mismatch is 400 (`:208-241`). It prefers the **host's own Jackson `ObjectMapper`**, resolved
reflectively so motu keeps no compile-time Jackson dependency, falling back to JSON-B — "the host
binds its own JSON DTOs with its own configured deserializers; motu never reinterprets their shape"
(`:126-149`).

`BrowserCallable` itself is the deny-by-default gate: `@Target({TYPE, METHOD})`, and "a bean is
reachable over HTTP only if the class or method carries this annotation"
(`java/endpoint/src/main/java/dev/motu/runtime/BrowserCallable.java:10-25`).

`MotuAssetEndpoint` serves the compiled `bridge.js` from the classpath at `GET /motu/bridge.js` — the
WebJar approach, so deploying the jar provides dispatcher and bridge as one self-contained artifact
independent of the host WAR's build pipeline (`MotuAssetEndpoint.java:14-49`). Content-Type is set on
the response builder, not just `@Produces`, because RESTEasy negotiation left the body as
`text/plain` and strict browsers refuse to execute that (`:19-22`).

**Is it required? No — for one host family.** It is needed only for a **Jakarta/JavaEE (WildFly)
ocean**: `java/endpoint/pom.xml` takes `jakarta.jakartaee-api` 10.0.0 as `provided` — "Provided by the
WildFly container. This module never bundles the EE API." A Next/React host needs none of it: no
annotation processor (the service map's type is the contract), and no dispatcher unless you choose
`HttpTransport`, in which case `createMotuRoute` is the Next equivalent
(`packages/adapters/next/src/contract.ts:1-8`, `packages/adapters/next/src/server.ts:44-52`). A host
using `DirectTransport` has no dispatcher at all, on either stack.

One live caveat, recorded in the build itself: the `maven-resources-plugin` execution that bundles
`bridge.js` into the jar pointed at a directory that had not existed for a long time, and
"maven-resources-plugin skips a missing directory without failing, so the jar has been shipping with
no bridge.js at all". It now points at `demo-app/roots/bridge/dist`, and the pom explicitly leaves
open whether the framework jar should couple to the demo app's Vite output
(`java/endpoint/pom.xml`, the `copy-bridge-bundle` comment).

---

## 9. The rule: never widen the backend surface

> Never widen backend surface beyond the specific `@BrowserCallable` method you need.

`.github/agents/island-create.agent.md:205`, repeated verbatim at
`.github/agents/island-extract.agent.md:315`, and folded into the prompt form at
`.github/prompts/island-create.prompt.md:36` ("Never work around a verify failure, widen backend
surface beyond the needed `@BrowserCallable` method, …") and
`.github/agents/island-locate.agent.md:165`.

**The failure it prevents:** widening is the cheapest way to make a red check green and the most
expensive thing to take back. On the Jakarta side, annotating a *class* instead of the one method
exposes every public method on it (`MotuRegistry.java:108-118`; the processor mirrors it at
`MotuManifestProcessor.java:80-90`) — a permanently reachable HTTP surface added to satisfy one
island. On a TS host, adding an entry to `defineServices` is one line and equally permanent
(`packages/adapters/next/src/services.ts:10-12`).

The design makes it *possible* to notice, which is why the rule is enforceable rather than
aspirational:

- deny-by-default is **structural** on both stacks — reachable only if annotated
  (`BrowserCallable.java:15-18`) or only if named in the map
  (`services.ts:10-12`; the peps instance says the same at
  `peps:motu/src/services/index.ts:8-9`);
- and an unexposed method is a 404 indistinguishable from a nonexistent one, on all three dispatchers
  (`MotuEndpoint.java:51-54`, `packages/adapters/next/src/server.ts:26`,
  `packages/runtime/src/direct-transport.ts:33-39`) — so "just try it" is not a discovery channel.

A related rule from the same files, for the same reason: keep the *stand-in* out of the shipped
graph. The archipelago imports the real component and the real source, and "what it must never import
is a FIXTURE — the source ships, the stand-in must not"
(`peps:motu/src/archipelagos/directory/directory.archipelago.ts:15-19`).

---

## 10. Worked end-to-end

An island needs server data. Six steps, in order.

**1 — Declare the callable surface.** One entry, the narrowest thing that answers the question.

*TypeScript host* (`peps:motu/src/services/index.ts:14-25`):

```ts
import { defineServices } from '@motu/adapter-next';
import { fetchDirectorySectors, fetchDirectoryTags } from '@/lib/services/directory';

export const services = defineServices({
  directory: {
    getSectors: fetchDirectorySectors,
    getTags: fetchDirectoryTags,
  },
});

export type AppServices = typeof services;
```

These are "the app's OWN service functions, referenced rather than reimplemented — the same ones the
directory page calls, hitting Supabase with the caller's session so row-level security decides what
comes back exactly as it does everywhere else" (`services/index.ts:11-13`). Keep the returned type;
widening it to `MotuServiceMap` loses every signature (`packages/adapters/next/src/services.ts:23-25`).

The island side is one file
(`peps:motu/src/contract.ts:8-11`):

```ts
import { createContract } from '@motu/adapter-next';
import type { AppServices } from './services/index';   // type-only: erased at build

export const contract = createContract<AppServices>();
```

*Jakarta host*: annotate the one method — `@BrowserCallable` on the method, not the class
(`BrowserCallable.java:20-25`) — build the backend so `dev.motu:apt` emits
`motu-manifest.json`, then `motu codegen` (§6).

**2 — Call it from the component.** `contract.directory.getSectors()`. Never a repository, never a
client, never `fetch` — "reaching around it (importing a repository into a component) would make the
island unverifiable, which is what `motu island verify` exists to prevent"
(`peps:motu/src/contract.ts:6-7`). If the data needs orchestration
(debounce, paging, a reset rule), that belongs in a **source** with a **port** (§3), not in the
island.

**3 — Choose the transport at the root, once.**

```tsx
export const Directory = createRegion(directoryArchipelago, {
  elements: ELEMENT_REGISTRY,
  transport: new DirectTransport(services),
  useHost: () => nextHostBridge(useRouter()),
});
```

`peps:components/motu/directory-region.tsx:27-35` (and its siblings).
`DirectTransport` when the app reads from the browser under row-level security;
`HttpTransport('/api/motu')` + `createMotuRoute` when the work must run on a server. The composition
root is the only file that knows, and `contract-only-io` makes sure it stays that way
(`packages/cli/src/commands/verify.mjs:190-206`).

**4 — Stub it in the lagoon.** `fixtures.mock.ts` beside the island: `fixtures`, `roles`, and at least
one `scenario` — two scenarios whose distinct output proves inputs actually reach the render
(`packages/cli/src/commands/create.mjs:109-135`, and `Scenario` at
`packages/runtime/src/mock.ts:78-90`). If the island's data is host-fed rather than island-fetched,
the stand-in is the **port**, installed by `channelFrom` in the lagoon region file
(`peps:motu/roots/lagoon/src/regions/directory.tsx:37-48`). Either way
the lagoon must have `"transport": "mock"` (`.../roots/lagoon/lagoon.config.json`), which is also the
default when there is nothing to talk to (`packages/react/src/lagoon-gallery.ts:185-186`).

**5 — Record a fixture against the real backend.**

```
motu fixtures record member-results --transport http
```

Writes `fixtures.recorded.ts` with request-keyed rows and any host-fed `seed`
(`packages/cli/src/commands/fixtures.mjs:101-108`). **Review it, then merge the rows you want into
`fixtures.mock.ts`** — nothing is installed for you. A captured 500 arrives as
`{ …, status: 500 }` and is a runnable scenario, not a comment
(`fixtures.mjs:124-129`).

**6 — Check it.**

```
motu island verify member-results     # no-bare-fetch, contract-only-io, host-stubs
motu check                            # contracts.generated.ts matches the components
```

Step 6 is where widening shows up. `contract-only-io` fails on a call the generated contract does not
carry, so a method that was never exposed cannot be reached from an island
(`packages/cli/src/commands/verify.mjs:222-240`).

---

## See also

- [01 — Concepts and terminology](01-concepts.md) — island, region, slot, key, lagoon.
- [03 — CLI reference](03-cli-reference.md) — `codegen`, `fixtures record` among the rest.
- [04 — Configuration](04-configuration.md) — `manifest`, `contract`, and the rest of `motu.config.json`.
- [05 — Archipelagos and regions](05-archipelagos-and-regions.md) — `sources`, `channels`, `bind`/`writes` (what the coupling graph is derived from).
- [07 — Checks and verification](07-checks-and-verification.md) — `no-bare-fetch`, `contract-only-io`, `host-stubs`.
- [08 — The lagoon](08-lagoon.md) — the transport toggle, forced-error states, `lagoon.config.json`'s `alias` table.
- [10 — Evidence and testing](10-evidence-and-testing.md) — scenarios, flows, and the unit tests a source still needs.
- [12 — Hosts and adapters](12-hosts-and-adapters.md) — `@motu/adapter-next`, `createMotuRoute`, the AngularJS bridge.
- [13 — Agents and skills](13-agents-and-skills.md) — the host rules quoted here, and where they are enforced.
