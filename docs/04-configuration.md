# Configuration — `motu.config.json` and `lagoon.config.json`

One file declares WHERE each piece of a project lands (islands, ui, archipelagos, contract, lagoon,
bridge, the backend manifest) and a handful of facts the checks need (which host stack, how hard
`root` is pushed, whether motu claims to be removable, whether the coverage fold runs). WHAT lives
inside those roots stays motu's convention, which is what keeps `motu island verify` / `create`
deterministic (`packages/cli/src/lib/config.mjs:1-9`). Every path defaults to the reference layout, so
a project that matches it needs no config at all.

---

## The rule that bites first: the config surface is an ALLOWLIST

`loadMotuConfig()` does not merge your file into the CLI. It hand-builds a result object, key by key
(`packages/cli/src/lib/config.mjs:183-338`). **A key absent from that object is silently dropped,
whatever the project wrote.** No warning, no error, no unknown-key report — the value simply never
reaches any command.

The source says so at `packages/cli/src/lib/config.mjs:209-216`, about the one time it cost a day:

> This whitelist is the config surface: a key absent from it is silently dropped, whatever the project
> wrote. `hostSources` was added to removal-check with a comment telling users to set it, and it did
> nothing at all until it appeared here — the escape hatch for a bug, itself broken in the same way the
> bug was.

There is a second layer with the same failure mode. A key resolved by `loadMotuConfig()` but never
surfaced on the `paths` object in `packages/cli/src/lib/util.mjs:33-114` is *whitelisted into a dead
end*. Four keys have already shipped that way — `isolation` (`util.mjs:35-43`), `coverage`
(`util.mjs:44-49`), `regionRoot` (`util.mjs:50-55`) and `appPackage` (`util.mjs:58-67`) — each failing
silently: the registry took a `'shadow'` default on a project declaring `light`; `archipelago init`
generated an import of a package that does not exist, because it read `paths.appPackage ?? 'motu-islands'`
and got `undefined`.

So: if a key you set appears to do nothing, the first thing to check is that it exists in
`config.mjs`'s returned object *and* on `paths` in `util.mjs`. If you are adding a key, add it in both
places and then reproduce the original bug and watch the fix refuse it.

The one escape valve: `raw` (`config.mjs:311-324`) carries the parsed config object verbatim, "for
keys the CLI does not model". Nothing in `packages/cli/src` reads it today.

---

## Where the file lives, and how it is found

`findConfig()` (`config.mjs:147-171`) walks **UP** from a start directory. At each level:

1. `motu.config.json` — if present, that directory is the PROJECT ROOT. Invalid JSON is fatal:
   `motu: invalid <path>: <message>` (`config.mjs:155`).
2. otherwise `package.json` with a top-level `motu` key — same effect, that directory is the root
   (`config.mjs:158-162`). An unreadable `package.json` is ignored and the walk continues.
3. otherwise go up one directory, until the filesystem root; if nothing is found, the project root is
   the cwd and `configPath` is `null` (`config.mjs:168`, `:179`, `:338`).

The result is cached for the life of the process (`config.mjs:173`, `:177`).

| Environment variable | Read at | Effect |
| --- | --- | --- |
| `MOTU_PROJECT_ROOT` | `config.mjs:178` | The walk starts HERE instead of `process.cwd()`. |
| `MOTU_ROOT` | `config.mjs:308` | Where the framework checkout is — the ONLY override for the derived value. There is no config key. |

`MOTU_PROJECT_ROOT` exists because the cwd is not always the project's
(`config.mjs:139-146`): the runtime harness is spawned with `cwd` set to the CLI package — it has to be,
or `--import tsx` does not resolve — and the walk went straight up into motu's OWN `motu.config.json`.
`motu island verify <name> --runtime --fast`, run in any project, loaded motu's demo app and verified
that instead, failing on a file the user's project had never heard of. If you spawn the CLI, set it.

`motu init` writes the file (`packages/cli/src/commands/init.mjs:172-198`), and refuses to overwrite an
existing one without `--force` (`init.mjs:152-155`). See [docs/02-getting-started.md](02-getting-started.md).

### How a config value becomes a path

Everything is resolved to an absolute path once, at load (`config.mjs:181-182`, `:327-338`):

    root     = the directory holding motu.config.json
    appRoot  = resolve(root, app)
    inApp(p) = resolve(appRoot, p)

`islands`, `ui`, `archipelagos`, `shared`, `barrel`, `contract`, `lagoon` and `bridge` go through
`inApp` — they are relative to the **APP root**. `manifest`, `hostRoot` and the cache directory
resolve against the **PROJECT root**, because the backend build output and the host application often
sit outside the frontend app (`config.mjs:14-15`, `:190`, `:205`, `:216`).

---

## Every key

Types and defaults are exactly as `config.mjs` computes them. "relative to" says which root a path
resolves against.

| Key | Type | Default | What it changes | Read by |
| --- | --- | --- | --- | --- |
| `app` | string, relative to project root | `"."` (`config.mjs:27`) | The frontend app root. Base for every path below marked *app root* (`config.mjs:181-182`). | everything; `APP_ROOT` (`util.mjs:19`) |
| `host` | `"angularjs" \| "next" \| "vite" \| "none"` | `"angularjs"` (`config.mjs:105`, `:208`) | Selects the adapter and the host-specific gates; drives `legacyFit`. | lagoon build (`lagoon-vite.mjs:219`), lagoon scaffolding (`lagoon-materialize.mjs:86-96`), `HOST` (`util.mjs:23`) |
| `hostRoot` | string, relative to project root | value of `app` (`config.mjs:108`, `:298`) | Where the HOST application lives — its `tsconfig` path aliases, Tailwind config, component library. | host alias reading (`util.mjs:163-184`), `resolveAppImport` (`util.mjs:363`), `hostStrictBoundaries` (`util.mjs:474`), `removal-check`, `lagoon`, `init` |
| `hostSources` | string[], relative to `hostRoot` | *unset* → the host's tsconfig, then a guess (`host-sources.mjs:97-109`) | Overrides both, for a layout neither gets right. | `removal-check` and `integrate check`, both through `hostSourceFiles()` (`lib/host-sources.mjs`) |
| `islands` | string, app root | `"src/islands"` (`config.mjs:33`) | Island mount points + `registry.ts` + `contracts.generated.ts`. | `island create/sync/verify/snapshot`, `check`, `changed` |
| `ui` | string, app root | `"src/ui"` (`config.mjs:38`) | `ui/<kebab>/<Pascal>.tsx` — the components islands mount, kept OUTSIDE `islands/` so mount points cannot import each other (`util.mjs:29-31`). | `island create`, `verify`, `integrate check` |
| `archipelagos` | string, app root | `"src/archipelagos"` (`config.mjs:43`) | Regions: `<id>.archipelago.ts`, `<id>.evidence.ts`, `registry.ts`, `coverage.generated.ts`. | `archipelago create/verify/sync/snapshot`, `archipelago coverage`, `lagoon` |
| `shared` | string, app root | `"src/shared"` (`config.mjs:47`) | Only `<shared>/styles.css`, the one shared island stylesheet (`util.mjs:110-111`). | lagoon build (`lagoon-vite.mjs`) |
| `barrel` | string, app root | `"src/index.ts"` (`config.mjs:52`) | The module exporting `ELEMENT_REGISTRY`. | runtime harness (`runtime-harness.mjs`), lagoon alias, `island sync`, `archipelago`, `init` |
| `contract` | string, app root | `"contract/src"` (`config.mjs:56`) | Output directory of `motu codegen`; `contract/src/index.ts` is the contract entry (`util.mjs:78`). | `motu codegen` (`codegen.mjs:10`) — see [docs/11-contract-and-backend.md](11-contract-and-backend.md) |
| `lagoon` | string, app root | `"roots/lagoon"` (`config.mjs:61`) | The lagoon root: its entries, `lagoon.config.json` (viewports + a11y policy, `util.mjs:255-275`), the vite install search starts here (`util.mjs:309-317`). | every `lagoon` command, all `--runtime` checks, `archipelago coverage` |
| `bridge` | string, app root | `"roots/bridge"` (`config.mjs:71`) | Resolved to `paths.bridgeDir`; declared for the layout's sake, read by no CLI command (`config.mjs:62-71`). | — |
| `manifest` | string, **relative to project root** | `"target/motu-manifest.json"` (`config.mjs:76`, `:337`) | Default input to `motu codegen` — the backend build output, which usually sits outside the frontend app. | `motu codegen` (`codegen.mjs:9`) |
| `appPackage` | string | `basename(appRoot)` (`config.mjs:205`) | The npm package name whose barrel exports `ELEMENT_REGISTRY`. | runtime harness, lagoon alias (`lagoon-vite.mjs`), `archipelago init` (`archipelago-init.mjs`), `init` |
| `tagPrefix` | string | `"x-"` (`config.mjs:85`) | Prefix of every custom element tag: `names(x).tag = tagPrefix + kebab` (`util.mjs:359`). | `island create`, `verify`, lagoon materialize, `init` |
| `isolation` | `"shadow" \| "light"` | `"shadow"`; anything not `"light"` becomes `"shadow"` (`config.mjs:207`) | Baked into the generated island registry as `setDefaultIsolation(...)` (`islands.mjs:78-92`). | `island sync`, lagoon, `create`, `defaults`, `archipelago-element.ts:63-66` |
| `regionRoot` | `"encouraged" \| "required"` | `"encouraged"`; anything but `"required"` is `"encouraged"` (`config.mjs:229`) | Whether a hand-written lagoon frame is a nudge or an error. | `archipelago verify` (`verify.mjs:2244-2250`) |
| `removable` | boolean | `true`; only an explicit `false` opts out (`config.mjs:265`) | Whether this project CLAIMS motu is deletable. `false` turns `removal-check` into a visible SKIP. | `removal-check` (`removal-check.mjs:285-292`), `check` (`check.mjs:218-228`) |
| `legacyFit` | boolean | `host === 'angularjs'` (`config.mjs:136`, `:297`) | Whether `legacy` is a required fit strategy and a verified runtime mount. | `island create` (`create.mjs:50`), `island verify` (`verify.mjs:393, 1130`) |
| `publishAs.repo` | string | `null` → the git remote (`config.mjs:277`) | The repository identity used on a lagoon host. | `lagoon publish` (`lagoon.mjs:250, 525`), `archipelago coverage` (`region-coverage.mjs:384, 415`) |
| `publishAs.slug` | string | `null` → derived (`config.mjs:278`) | The project slug on the lagoon host. | `lagoon publish/serve` (`lagoon.mjs:159, 407`) |
| `coverage.enabled` | boolean | **`false`**; only `true` enables (`config.mjs:243`) | Whether the coverage fold runs at all. Emits `configureCoverage(...)` into `archipelagos/coverage.generated.ts`; off emits an empty module (`archipelagos.mjs:30-65`). | `archipelago sync`, `check` (`check.mjs:46-52, 190`) |
| `coverage.corpusUrl` | string | `null` (`config.mjs:248`) | Where `motu archipelago coverage <id>` fetches the corpus from, on a DEVELOPER's machine. Never reaches a browser. | `archipelago coverage` (`region-coverage.mjs:214-223`) |
| `coverage.regions` | string[] | `null` → every region (`config.mjs:249`) | Region ids to watch. `"*"` also means every region (`packages/coverage/src/index.ts:744-746`). | `archipelago sync` (`archipelago-sync.mjs:15-18`), baked into `coverage.generated.ts` |

Derived values, not settable: `root`, `appRoot`, `cacheDir` (`resolve(root, '.motu/cache')`, gitignored —
`config.mjs:309-310`), `configPath`, and the resolved `*Dir` paths.

**Not in the allowlist, therefore inert:** `coverage.endpoint`, `coverage.known`, `coverage.knownUrl`,
`coverage.maxReports` — they exist on the runtime `CoverageConfig` interface
(`packages/coverage/src/index.ts:642-668`) but `loadMotuConfig` copies only `enabled`, `corpusUrl` and
`regions`. Writing them here does nothing. So does `coverage.enums`, which belongs on the archipelago
(see below).

---

## There is no `motuRoot` key — the framework finds itself

`@motu/*` are unpublished packages whose entry point is raw TypeScript, so a project resolves them BY
PATH rather than through `node_modules` — that is what lets a project adopt motu with no install step.

**Where the checkout is, is derived, not asked for.** `packages/cli/src/lib` → up four → the checkout
root, taken from the file that is currently executing (`config.mjs:112-133`):

> Which made `motuRoot` in every adopting project's config a bug rather than a configuration: two
> modules of the same package disagreed about a knowable fact, and the one that asked put a
> machine-specific path (`"../../motu"`, `"../../../../motu"`) into a committed file — the single line
> that made a clone fail on someone else's machine.

The derivation is verified rather than assumed: if that directory holds no `packages/core/src/index.ts`,
`FRAMEWORK_ROOT` is `null` and the fallback is the project root (`config.mjs:133`, `:308`).

Precedence is now two deep: **`$MOTU_ROOT` → the derived checkout → the project root**
(`config.mjs:308`).

**The config key was removed.** It survived for a while as an override "for a differently-placed
checkout or a CI image" — but `$MOTU_ROOT` already answers both, and answers them better. The one
property the config key had that the environment variable does not is that it gets COMMITTED, which is
precisely the bug it caused. A key whose only distinguishing feature is its failure mode is not an
escape hatch. `motu init` no longer writes it under any circumstance, including when `$MOTU_ROOT` was
set for that init (`init.mjs:189-196`) — that took an override correct for ONE machine and froze it
into the file every other machine reads.

**If your config still has the line**, motu says so rather than dropping it quietly — the silent-drop
behaviour this page opens with is exactly what a removal must not repeat (`config.mjs:341-355`):

```
MotuDeprecationWarning: motu: `motuRoot` was removed and is being ignored (/path/motu.config.json).
  The framework checkout is derived from the running CLI: /home/you/dev/motu
  Delete the line. If that path is wrong, export MOTU_ROOT=<checkout> instead — it is the
  same override without committing a machine-specific path.
```

Delete the line. Set `$MOTU_ROOT` in the environment only if the derivation is genuinely wrong for you.

## `removable` — a claim, and the reason it is not a switch

`removal-check` asks one question: delete motu, does the application still compile? The comment at
`config.mjs:252-264` is the whole argument:

> It is the right question for a host that ADOPTED motu: the promise is that islands leave no runtime
> trace. It is not a question motu's own tools can answer. The baseline review console composes regions
> with `createRegion` and paints from `@motu/chrome/react`; motu is meant to be load-bearing there, and
> it will never compile without it.
>
> Reported as a SKIP rather than a pass, because a project opting out has not proved anything — and
> reported at all, because an opt-out nobody can see is how a check quietly stops running.

Default `true`: a host must say so deliberately, and the answer for an adopting app stays FAIL. `check`
prints `– removable  not claimed — the project declares removable: false` and excludes it from the
green summary line (`check.mjs:218-228, 262-264`).

**What breaks if you set it wrong:** setting `removable: false` on an adopting app does not fix a
removal failure, it hides one — you have converted the one check that proves motu leaves no trace into a
dimmed line nobody reads. It is not a hatch for an app that finds removal inconvenient. See
[docs/07-checks-and-verification.md](07-checks-and-verification.md).

## `hostSources` — the last word, not the first

`removal-check` and `integrate check` both need to know where the host keeps its code. They ask one
resolver, `hostSourceFiles()` (`packages/cli/src/lib/host-sources.mjs`), which answers in three steps:

1. **`hostSources`**, if set — an explicit list of roots, relative to `hostRoot`.
2. **the host's own `tsconfig.json`** (or `jsconfig.json`) — the file set it declares through
   `include`/`exclude` and its `extends` chain, read with `ts.getParsedCommandLineOfConfigFile`.
3. **the guess** — `['app', 'components', 'lib', 'src', 'pages']`, filtered to what exists.

Step 2 is the one worth understanding, because it removes most reasons to set the key at all. The
application already declared what it compiles, and `removal-check` was already trusting that
declaration for the half that decides the verdict — it runs `tsc --noEmit -p tsconfig.json`. Its file
walk used the guess, so ONE CHECK CARRIED TWO DEFINITIONS of "the application". Measured on this
repository's own Next host, the guess misses `middleware.ts` and all eight files under `test/`: source
`tsc` compiles and the surgery would never have unwrapped, which is how a dangling import ends up on a
line that looks fine.

The guess remains, and is not vestigial — the review console has no tsconfig at all, and neither does a
JS host. A **solution-style** tsconfig falls through to it too: this repository's root config is
`{ "files": [], "references": [...] }`, which declares no files of its own, so trusting it would produce
exactly the empty scan the whole mechanism exists to prevent. `fromTsconfig` returns `null` on an empty
file set for that reason (`host-sources.mjs:83-87`).

Set the key when your layout defeats both — a monorepo host whose tsconfig does not reach the packages
you care about:

```json
{
  "hostRoot": "..",
  "hostSources": ["packages/twenty-front/src", "packages/twenty-ui/src"]
}
```

Set it too NARROW and you get the original bug back: a check that examined less than the application and
reported a pass. Both reports name their scanned count *and where they looked* — `scanned 0 files under
. (declared by tsconfig.json)` versus `(guessed: app, components)` versus `(hostSources: …)` — so an
empty scan says which of the three it trusted before finding nothing, and exits non-zero rather than
green (`describeSources`, `host-sources.mjs:117-121`).

> Originally this key was read by `removal-check` only, while `integrate check` printed the same "set
> `hostSources`" advice and then ignored it, hardcoding the five directories. Both now go through the
> one resolver, so the advice and the behaviour agree.

## `isolation` — shadow or light

`"shadow"` (the default) gives a region one shadow root and one adopted stylesheet; nested islands render
into it. `"light"` uses no shadow at all and injects region + island styles globally
(`packages/core/src/archipelago-element.ts:63-66`). A React host generally wants `light`: shadow DOM
would cut islands off from the host's own stylesheet, Tailwind included — which is why `motu init`
defaults it to `light` for every host but `angularjs` (`init.mjs:166-169`).

The value is baked into the generated island registry as `setDefaultIsolation('<value>')`
(`islands.mjs:78-92`); an explicit `isolation` attribute on `<motu-archipelago>` still wins per region
(`archipelago-element.ts:100-103`). `renderRegistry` now throws rather than defaulting when the value is
neither `'light'` nor `'shadow'` (`islands.mjs:54-58`), because a silent default is exactly how the
`paths` dead-end bug shipped.

**What breaks if you set it wrong:** `shadow` on a Tailwind host renders every island unstyled, in the
lagoon and in the page, with no check failing.

```json
{ "host": "next", "isolation": "light" }
```

```json
{ "host": "angularjs", "isolation": "shadow" }
```

The first is the React default: islands sit in the host's own DOM and inherit its Tailwind. The second
is the ocean's: one shadow root per region, so a legacy page's global CSS cannot reach in.

## `host` and `legacyFit`

`host` is the stack the islands are embedded INTO (`config.mjs:101-105`). It selects the adapter
(`packages/adapters/{angularjs,next,vite}`, chosen at `lagoon-vite.mjs:219`) and decides whether the
legacy-fit gate applies:

> fitting an island to a legacy skin is only meaningful when there IS a legacy skin. `'angularjs'` = the
> reference ocean; `'next'`/`'none'` = a modern React host, where an island is mounted directly and there
> is nothing to fit to.

`legacyFit` derives from it — `true` only for `angularjs` (`config.mjs:136`, `:297`) — and controls whether
`island create` scaffolds `legacy: 'fill'` (`create.mjs:50`) and whether `island verify` requires the
`legacy` strategy and drives a second runtime mount (`verify.mjs:393, 1130`). Override it explicitly only
when your host has a legacy skin motu does not know about.

`motu init` accepts `angularjs | next | none | vite` (`init.mjs:121`); `vite` was supported everywhere
except `init` for a while, which is a good reminder that the config loader accepts any string here — an
unknown value simply resolves no adapter directory (`lagoon-vite.mjs:219`). See
[docs/12-hosts-and-adapters.md](12-hosts-and-adapters.md).

## `hostRoot` — where the host's own language is read from

`hostRoot` is not decoration. `util.mjs:163-184` reads `<hostRoot>/tsconfig.json` (or `jsconfig.json`) for
its `compilerOptions.paths`, because "an island that wraps a component the app already owns imports it
the way the app does". `resolveAppImport` resolves `@/…` against it (`util.mjs:363`), and
`hostStrictBoundaries` follows its `extends` chain looking for `noUncheckedIndexedAccess`
(`util.mjs:474-499`). `removal-check` walks it for host sources.

Point it at the wrong directory and every alias goes unresolved: `props-match` and the component checks
report "couldn't find" for components sitting right in front of them, and `removal-check` scans a tree
that is not the application.

## `publishAs` — who this project is on a lagoon host

Publishing normally identifies a project by its git remote, which is right until a repository holds more
than one publishable app (`config.mjs:266-275`):

> motu's own demo-app and the baseline review console both live in `Scorbutics/motu` and would land on the
> same `repo:slug`, each overwriting the other — and a gallery that takes one lagoon per repo would show
> whichever published last.

Either half can be set; whatever is absent keeps its derived value (`lagoon.mjs:159, 250, 407, 525`).
`archipelago coverage` uses `publishAs.repo` for the same identity when reading a corpus from a host
(`region-coverage.mjs:384, 415`). See [docs/08-lagoon.md](08-lagoon.md).

```json
{ "publishAs": { "repo": "motu-host" } }
```

```json
{ "publishAs": { "repo": "acme/design", "slug": "checkout" } }
```

Set only what the derivation gets wrong. The first pins the repo and lets the slug derive; the second
pins both, for a monorepo publishing several lagoons from one remote.

## `regionRoot` — `"encouraged"` (default) or `"required"`

A region composes either from its archipelago's `root`, which is safe by construction, or from a
hand-written lagoon frame, which is a second description of the page and only as safe as the checks
comparing it (`config.mjs:218-228`). Both work. The default SAYS SO and passes; a project that has
finished migrating sets `"required"` and the frame becomes an error (`verify.mjs:2244-2250`) — which is
what stops the old shape creeping back in. Setting it before you have migrated fails a project on its
first day, which is "a tool nobody adopts".

[docs/06-composition-and-adoption.md](06-composition-and-adoption.md) owns this topic.

```json
{ "regionRoot": "required" }
```

The switch you flip **last** — after every region has a `root`. Until then leave it absent: the default
`"encouraged"` grades a frame-composed region `✓` while still naming `root` in the line, which is what
lets a project adopt motu without refactoring its pages on day one.

## `coverage` — deployment facts only, and no addresses

`coverage` is the one part of motu designed to run in production (`config.mjs:230-241`). Three rules are
encoded in the loader:

**1. `enabled` defaults to FALSE.** `cfg.coverage?.enabled === true` — anything else is off
(`config.mjs:243`). "A thing that runs in production is a thing somebody switched on." With coverage off,
`motu archipelago sync` writes an *empty* `coverage.generated.ts`, so nothing in the project names
`@motu/coverage` and no bundler ships it, while the registry's import line stays constant
(`archipelagos.mjs:18-22, 36-42`).

**2. NO ADDRESSES HERE.** The comment at `config.mjs:244-247`:

> They would be baked into the generated island registry, which the lagoon imports and publishes as a
> public page. The application renders them as meta tags; see `metaContent` in `@motu/coverage`.
> `corpusUrl` is different — it is read by the CLI on a developer's machine and never reaches a browser.

```json
{
  "coverage": {
    "enabled": true,
    "regions": ["actions", "directory"],
    "corpusUrl": "https://lagoon.example.com/api/coverage?repo=acme/app&region=actions"
  }
}
```

`regions` accepts `["*"]` for every region. `corpusUrl`'s `region=` is rewritten per region by the CLI,
so the one in the file is a template rather than a fixed target. The endpoint the BROWSER posts to is
not here — it is a meta tag the application renders:

```html
<meta name="motu-coverage-endpoint" content="/api/motu/coverage" />
<meta name="motu-coverage-known"    content="/api/motu/coverage/known" />
```

That is why `endpoint` and `knownUrl` exist on the runtime `CoverageConfig` and are *not* in this
allowlist. A real published lagoon was grepped and found to contain exactly
`wI({enabled:!0,endpoint:"/api/motu/coverage",knownUrl:"/api/motu/coverage/known",…})`
(`packages/coverage/src/index.ts:672-687`). Same reasoning for secrets: a coverage token comes from
`MOTU_COVERAGE_TOKEN` or `--token` and is never read from config
(`region-coverage.mjs:235-239`).

**3. `enums` is declared on the ARCHIPELAGO, not here.** Whether a key is a closed set is a fact about
the key, so it travels with the region: `coverage: { enums: [...] }` on the archipelago
(`config.mjs:234-236`, parsed at `region-coverage.mjs:53-61`, typed at `packages/coverage/src/index.ts:638-641`).
Putting it in `motu.config.json` does nothing.

`corpusUrl` is fetched by `motu archipelago coverage <id>` from a developer's machine. It is rewritten per
region: a `{region}` placeholder is substituted, otherwise `?region=<id>` is appended
(`region-coverage.mjs:200-213`). A root-relative path (`/api/motu/coverage/status`) is a config mistake and
is reported as one — it needs an origin (`region-coverage.mjs:301-314`).

The full story is [docs/09-coverage.md](09-coverage.md).

---

## The OTHER file: `lagoon.config.json`

`motu.config.json` says where things live. `<lagoon>/lagoon.config.json` says what the lagoon IS, and
it is a separate surface with separate readers — the CLI reads some keys from node
(`packages/cli/src/lib/util.mjs:255`, `:272`, `:291`), the gallery reads others in the browser
(`packages/react/src/lagoon-gallery.ts:161-162`, `:289-300`), and the materialized entries read the
rest (`packages/cli/src/lib/scaffold.mjs:264`, `:369-371`).

It is scaffolded by `motu init` (`commands/init.mjs:320`) and is entirely optional — every key has a
default.

| Key | Shape | Default | What it changes | Read by |
|---|---|---|---|---|
| `about` | string | none | The blurb the Cmd/Ctrl-K palette shows | gallery |
| `transport` | `"mock"` \| `"http"` | `"mock"` | The BUILD-TIME default. `MOTU_TRANSPORT`, `?transport=`, and the toolbar chip all override it | `lagoon-gallery.ts:293` |
| `httpBase` | string | none | Where `HttpTransport` points when the transport is `http`. Its presence is also what makes the transport chip a real choice | `lagoon-gallery.ts:299-300`, `:1064` |
| `mount` | `"react"` \| `"element"` | host-dependent | Which tree islands render in. **Must match the host application** or `island verify` green-lights a mount path the project never ships | `scaffold.mjs:371`, `:477` |
| `chrome` | `{ primary, onPrimary, … }` | motu teal | Points motu's own tooling at the host's colours. Prefer a REFERENCE to the host's token (`"hsl(var(--primary))"`) over a copied hex, so a rebrand moves the tooling with it. `onPrimary` is required whenever `primary` is light | `lagoon-gallery.ts:242`, `:289`; `scaffold.mjs:369` |
| `viewports` | `{ name: width }` | `{ mobile: 390, desktop: 1280 }` | The widths the `responsive` check measures AND the lagoon's own width switcher — one list, so what you look at is what CI measures | `util.mjs:255-260` |
| `a11y` | `{ fail, ignore[] }` | `{ fail: "never" }` | How hard `a11y` bites. `fail` is `critical` \| `serious` \| `never`; `ignore` is a list of axe rule ids. Warnings by default, deliberately — "a check that turns an existing codebase red on the day it ships gets switched off, not acted on" | `util.mjs:263-275` |
| `alias` | `{ specifier: path }` | none | The modules this project stands down in the lagoon. **This is the one definition of a MODULE effect** — the `effects` check derives from these keys, not from a path convention | `util.mjs:277-298` |
| `stations` | `{ id: { label, order } }` | `{}` | Renames and orders archipelagos in the switcher. **Never controls visibility** — an archipelago missing from `stations` still appears, so a new one cannot be invisible because somebody forgot a config edit | `lagoon-gallery.ts:162` |
| `exclude` | string[] | `[]` | Archipelago ids to keep out of the gallery | `lagoon-gallery.ts:161` |
| `env` | `{ NAME: value }` | `{}` | Merged into `process.env` for the lagoon build, over `NODE_ENV: 'development'` | `scaffold.mjs:264` |
| `defaultTheme` | string | `"motu"` | The theme axis the lagoon opens on | `lagoon-bootstrap.ts:466` |
| `title` | string | derived | The project's name in a lagoon host's listing. Prefer this over `motu lagoon publish --title`: a republish that forgets the flag renames the project back | `commands/lagoon.mjs:161-168`, `:219-221` |

**What does NOT go here.** Anything that is a function or a live object — `layout`, `seed`, `channels`,
`providers`, `setup`, `transportFor` — belongs in `<lagoon>/src/lagoon.tsx`, the overrides module. A
declaration cannot hold a component or a channel handler. See
[08 — The lagoon](08-lagoon.md) and [10 — Evidence and testing](10-evidence-and-testing.md).

---

## Worked examples

### Minimal

A project whose layout matches the reference needs no file at all. The smallest useful one names the app
sub-directory:

```json
{
  "app": "demo-app"
}
```

### motu's own (`motu.config.json`)

```json
{
  "app": "demo-app",
  "manifest": "../ocean/web-console/target/classes/motu-manifest.json",
  "isolation": "light"
}
```

Three lines, and each one is a departure from the defaults: the app is a sub-package; the backend
manifest is produced by a Java build in a sibling tree, so it resolves against the PROJECT root, not the
app; and islands render in light DOM. `host` is left at `angularjs`, so `legacyFit` is on and the legacy
fit gate applies. Note what is NOT here: no `removable`, even though motu's own surfaces set
`removable: false` where motu is load-bearing.

### A real adopting project (peps, a Next host)

`motu/motu.config.json` inside the host repository:

```json
{
  "app": ".",
  "host": "next",
  "hostRoot": "..",
  "islands": "src/islands",
  "ui": "src/ui",
  "archipelagos": "src/archipelagos",
  "shared": "src/shared",
  "contract": "contract/src",
  "lagoon": "roots/lagoon",
  "appPackage": "motu-islands",
  "tagPrefix": "x-",
  "isolation": "light",
  "coverage": {
    "enabled": true,
    "regions": ["*"],
    "corpusUrl": "https://motu.tail77d0a9.ts.net/api/coverage?repo=Scorbutics/peps_ta_boite_app&region=actions"
  }
}
```

The shape worth copying: motu lives in its own `motu/` sub-directory of the host repo, so `app` is `"."`
(the motu project root IS the app root) and `hostRoot` is `".."` — the Next application above it, whose
`tsconfig` aliases, Tailwind config and components the lagoon borrows. `host: "next"` turns the legacy fit
gate off. `isolation: "light"` keeps islands inside the host's Tailwind. `appPackage` is explicit because
`basename(appRoot)` would be `motu`. Coverage is on for every region, with the corpus read from the lagoon
host's own `/api/coverage` — the URL already carries `region=actions`, which `configuredUrl` rewrites per
region.

This config used to carry `"motuRoot": "../../motu"` — the machine-specific path `config.mjs:112-133`
was written to eliminate. The key no longer exists; a project that still has the line gets a
deprecation warning and the derived checkout.

### motu's own Next host (`host-app/motu/motu.config.json`)

The third real shape in this repository, and the one to read beside peps — same posture, two keys peps
does not have:

```json
{
  "app": ".",
  "host": "next",
  "hostRoot": "..",
  "islands": "src/islands",
  "ui": "src/ui",
  "archipelagos": "src/archipelagos",
  "shared": "src/shared",
  "contract": "contract/src",
  "lagoon": "roots/lagoon",
  "appPackage": "motu-host-islands",
  "tagPrefix": "x-",
  "isolation": "light",
  "removable": false,
  "publishAs": { "repo": "motu-host" }
}
```

`removable: false` because motu is load-bearing here by choice — this host's screens ARE motu, so
"delete motu, does it still compile?" is a meaningless question and `removal-check` reports a SKIP
rather than a pass. `publishAs.repo` because this repository holds more than one publishable app, and
without it `host-app` and `demo-app` would land on the same `repo:slug` and overwrite each other.

### The smallest adoption config

Adding motu to an existing Next app, with nothing else decided yet:

```json
{
  "app": ".",
  "host": "next",
  "hostRoot": ".."
}
```

Everything else takes its default. Notably absent: `regionRoot`, which stays `"encouraged"` so a
frame-composed region passes — that is stage 1 of
[composition and adoption](06-composition-and-adoption.md), and it is the correct place to start.

---

## What the source says about each key

Every key is now commented where it is defined, and each comment says the same two things: what READS
it, and what BREAKS when it is wrong. That second half is the point — "where the islands live" is
obvious from the name, and "which check silently finds nothing" is not.

| Key | Comment lives at | The failure it names |
|---|---|---|
| `app` | `config.mjs:24-27` | Moves every other path at once; a wrong value makes every walk return empty, with no error |
| `islands` | `config.mjs:28-33` | `island verify --all` verifies zero islands, successfully |
| `ui` | `config.mjs:34-38` | Why it is OUTSIDE `islands/`: a directory boundary is what stops mount points importing each other |
| `archipelagos` | `config.mjs:39-43` | A project reports zero regions rather than failing to find them |
| `shared` | `config.mjs:44-47` | The lagoon builds fine and renders every island unstyled |
| `barrel` | `config.mjs:48-52` | Every `--runtime` check fails to import the registry at all |
| `contract` | `config.mjs:53-56` | Read only by `codegen`, as the default out-dir |
| `lagoon` | `config.mjs:57-61` | motu materializes a second lagoon beside the real one |
| `bridge` | `config.mjs:62-71` | **Declared, not driven** — see below |
| `manifest` | `config.mjs:72-76` | The one path relative to the PROJECT root, and why |
| `tagPrefix` | `config.mjs:77-85` | Changing it on a live project renames every tag: islands stop upgrading, silently |
| `isolation` | `config.mjs:86-100` | `shadow` on a Tailwind host renders every island unstyled, with no check failing |
| `appPackage` | `config.mjs:186-205` | The `undefined` that generated an import of a package that does not exist |
| `legacyFit` | `config.mjs:280-297` | Both directions: a wasted second browser mount, or the legacy mount never driven |
| `raw` | `config.mjs:311-324` | Read by nothing, deliberately — see below |

The keys that were already documented — `hostSources`, `regionRoot`, `coverage`, `removable`,
`publishAs`, `host`, `hostRoot` — keep their own comments, and each has a section above.

### The two that are read by nothing

Both were flagged as "vestigial or an unfinished seam". Investigated, they are neither, and the
comments now say so rather than leaving the next reader to re-derive it:

- **`bridge`** declares where the ocean composition root lives — `bridge.js`, the embedded IIFE
  injected into legacy pages. `motu init` writes it for `angularjs` hosts only (`init.mjs:180`) and it
  resolves to `paths.bridgeDir`, but no CLI command reads that path: the bridge is built by the
  project's own vite (`pnpm --filter @demo-app/bridge build`), because it is an application artifact
  with an application's dependencies, not something motu generates. The key exists so the layout is
  declared in one place instead of being assumed by whoever writes the build script. **Changing it
  moves nothing on its own** — move the directory and update your build script too.

- **`raw`** is the escape hatch around the allowlist this page opens with, and nothing in
  `packages/cli` reads it. That is the correct state, not an oversight: every time a key has actually
  been needed, the right answer was to add it to the allowlist properly, where it gets a type, a
  default, a comment and a place on `paths`. A command reading `raw` would be re-creating the untyped,
  undefaulted, uncommented surface the allowlist exists to prevent. It stays because it costs one line
  and it is the right seam for a genuinely project-specific key — one motu should not model.

---

Related: [01-concepts](01-concepts.md) · [02-getting-started](02-getting-started.md) ·
[03-cli-reference](03-cli-reference.md) · [05-archipelagos-and-regions](05-archipelagos-and-regions.md) ·
[06-composition-and-adoption](06-composition-and-adoption.md) ·
[07-checks-and-verification](07-checks-and-verification.md) · [08-lagoon](08-lagoon.md) ·
[09-coverage](09-coverage.md) · [10-evidence-and-testing](10-evidence-and-testing.md) ·
[11-contract-and-backend](11-contract-and-backend.md) · [12-hosts-and-adapters](12-hosts-and-adapters.md) ·
[13-agents-and-skills](13-agents-and-skills.md)
