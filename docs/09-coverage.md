# Coverage — the states production reached that nobody previewed

Every other check motu ships compares a region to its own declaration: does it mount, does it write
what it claims, do its flows end where they promise. Coverage asks the one question none of them can —
**is what the region declares the set of things that actually HAPPEN?** A scenario set describes the
states someone thought of; production is the only witness to the ones nobody did, and it is the
environment that runs without anybody watching (`packages/coverage/src/index.ts:1`). The gap between
the two — recorded states no flow previews — is the finding.

Related pages: [concepts](01-concepts.md) · [archipelagos and regions](05-archipelagos-and-regions.md) ·
[checks and verification](07-checks-and-verification.md) · [lagoon](08-lagoon.md) ·
[evidence and testing](10-evidence-and-testing.md) · [configuration](04-configuration.md) ·
[CLI reference](03-cli-reference.md).

---

## 1. This is not code coverage

Code coverage asks which LINES executed. It says nothing about the shape the application was in when
they did, and a region can execute every line while never once being in the state that breaks it.
Coverage here counts **region states** — the declared keys of an archipelago, each reduced to a
category — and compares them against the states the region's flows establish
(`packages/cli/src/commands/region-coverage.mjs:1`).

Why a fingerprint and not a recording, in the source's own words
(`packages/coverage/src/index.ts:8`):

> Recording responses means recording customer data, in unbounded volume, in a vocabulary that does
> not match a scenario — so comparing the two would be guesswork even if you were willing to store it.
> A region is different, and this is the one place motu's own design pays a dividend it could not
> otherwise: the archipelago DECLARES its keys, so the state space is enumerable and small.

Two consequences fall out for free (`packages/coverage/src/index.ts:15`): there is **nothing to
flood** — you accumulate distinct STATES, not events, so the ten-thousandth user in the same state
increments an integer — and there is **almost nothing to leak** — `criteria: set`, never the criteria.
And the comparison is apples to apples, because a scenario is also a seed of region keys: the same
function fingerprints both sides (`packages/coverage/src/index.ts:20`).

---

## 2. The fingerprint model

### `KeyState`

`packages/coverage/src/index.ts:31` — what a key holds, reduced to something safe to count.

| `KeyState` | Produced by (`keyState`, `packages/coverage/src/index.ts:50`) |
| --- | --- |
| `absent` | `undefined` — nothing has ever written this key |
| `null` | `null` — explicitly emptied |
| `empty` | `''`, `[]`, `{}` (a zero-length array, an object with no own keys) |
| `set` | any non-empty value whose value is not kept |
| `true` / `false` | a boolean, keeping its value |
| `` `= ${string}` `` | an allowlisted enum value, at most `maxEnumLength` characters |

`absent` and `null` are deliberately different (`packages/coverage/src/index.ts:26`):

> a key nothing has ever written and a key explicitly emptied are different states of a region, and
> conflating them hides the one that usually breaks. Booleans keep their value because a boolean
> cannot identify anybody and `busy: true` is exactly the kind of state nobody writes a scenario for.

`keyState(value, keepValue = false, maxEnumLength = 32)` is exported for the same reason the
fingerprint is: both sides use it (`packages/coverage/src/index.ts:49`). A string is kept verbatim
only when `keepValue` is true AND it is at most `maxEnumLength` (default 32,
`packages/coverage/src/index.ts:47`) — "a long string is not a closed set"
(`packages/coverage/src/index.ts:43`). A number is kept verbatim when `keepValue` is true.

### `RegionFingerprint` and `fingerprintRegion()`

`RegionFingerprint` is `Record<string, KeyState>` — one region state: every declared key, categorised
(`packages/coverage/src/index.ts:34`).

`fingerprintRegion(keys, read, opts)` (`packages/coverage/src/index.ts:72`) takes the key list, a
`read(key)` accessor and `FingerprintOptions` (`enums`, `maxEnumLength` —
`packages/coverage/src/index.ts:36`). It sorts the keys and categorises each one.

**Why the output is bounded** (`packages/coverage/src/index.ts:64`):

> `keys` is the DECLARATION — the archipelago's own key list — not whatever happens to be in the
> store. That is what bounds the output and what makes two fingerprints comparable: a state is a row
> with one column per declared key, always the same columns, so a corpus and a scenario set line up
> without any reconciliation step.

The declaration is derived, never hand-maintained: `declaredRegionKeys(regionId)`
(`packages/coverage/src/index.ts:363`) unions what islands READ (`bind`), what they PRODUCE
(`writes`), what a `reads` claim names, and what a declared source `produces`. The CLI computes the
same union statically (`packages/cli/src/commands/region-coverage.mjs:37`), and the two must agree or
a corpus recorded in a browser cannot be compared to anything.

### `fingerprintId()`

`fingerprintId(fp)` (`packages/coverage/src/index.ts:85`) renders a fingerprint as one stable line —
`busy:false criteria:set error:null viewMode:= accepted` — sorted by key. That line is the identity a
corpus counts by, what a report prints, and what `--accept` and `--forget` name.

### `keysHash()` — FNV-1a

`keysHash(keys)` (`packages/coverage/src/index.ts:110`) is eight hex characters over the sorted,
NUL-joined key list. The `keys` array already carries the declaration and `mergeCorpora` already
compares it, so the hash proves nothing new. What it buys is **a place to put it**
(`packages/coverage/src/index.ts:95`):

> a server upserting on `(region, keysHash, fingerprint)` buckets automatically, so the deploy that
> adds a key starts a new bucket instead of silently mixing states that fingerprint differently — and
> the old bucket becomes a thing you can drop in one statement rather than a set you would have to
> reason about.

It also makes drift cheap to CHECK: comparing declarations otherwise means pulling the corpus,
comparing eight characters does not. And it is **FNV-1a, not a crypto hash**
(`packages/coverage/src/index.ts:107`): "this identifies a declaration, it does not protect one, and a
dependency would be a strange price for eight characters."

This earned its place in practice. `coverage.corpusUrl` is one string for a project with several
regions, so a `region=` written into it is right for exactly one of them; `motu archipelago coverage
directory` once fetched the actions corpus. The declaration guard caught it — `corpus 7f46c60a vs code
3eda0a71` — where without it every state would have been reported uncovered with nothing to say why
(`packages/cli/src/commands/region-coverage.mjs:193`).

---

## 3. The corpus and the fold

### `CORPUS_VERSION`, `CoverageEntry`, `CoverageCorpus`

`CORPUS_VERSION = 1` (`packages/coverage/src/index.ts:93`) — "bumped when a reader could misread an
older one, never for an addition."

`CoverageEntry` (`packages/coverage/src/index.ts:120`):

| Field | Meaning |
| --- | --- |
| `fingerprint` | the `RegionFingerprint` |
| `count` | how many times this state was entered — "not how many users — a fold, not a log" (`:122`) |
| `firstAt`, `lastAt` | epoch ms; "enough to tell 'still happening' from 'used to'" (`:125`) |

`CoverageCorpus` (`packages/coverage/src/index.ts:129`):

| Field | Meaning |
| --- | --- |
| `v?` | format version. Present because a corpus crosses a PROCESS boundary — written by a browser, merged by something else, read by the CLI — and the three can be deployed at different times (`:130`) |
| `keysHash?` | which declaration this was recorded against. Absent in a v1 corpus written before the stamp existed, which is why every reader falls back to comparing `keys` (`:136`) |
| `regionId` | the archipelago id |
| `keys` | declared keys at recording time — "a corpus taken against a different declaration is not comparable, and this is what lets the check say so instead of reporting nonsense" (`:140`) |
| `entries` | `CoverageEntry[]`, most-seen first |

### `CoverageRecorder`

`packages/coverage/src/index.ts:154` — the fold, "bounded by construction, and by a cap for the case
the bound is wrong."

- `new CoverageRecorder(keys, opts)` where `opts` is `FingerprintOptions & { limit?: number }`.
- `record(read, at)` (`:164`) — fingerprint the current state; increment if seen, otherwise insert.
  "Cheap enough to call on every store change."
- `dropped` (`:181`) — how many distinct states were refused by the cap. **Non-zero means the corpus
  is INCOMPLETE.**
- `corpus(regionId)` (`:185`) — stamps `v`, `keysHash`, sorted `keys`, entries sorted by `count`.

`limit` defaults to 500 (`packages/coverage/src/index.ts:173`) and exists for a stated reason
(`:146`):

> `limit` is not expected to bind: the state space is the product of the declared keys' categories,
> which for a seven-key region is dozens of rows in practice. It exists because "in practice" is doing
> work in that sentence — one allowlisted enum with more members than its author remembered would
> otherwise grow this without limit in the one environment nobody is watching.

### `mergeCorpora()`

`mergeCorpora(corpora)` (`packages/coverage/src/index.ts:802`) is pure, and "the whole of the
server-side logic": whatever collects beacons — a scheduled job over a bucket, a queue consumer, a
person with a directory of JSON files — needs exactly this and nothing else. It **throws** rather than
fold when corpora disagree about the region (`:809`), about the declaration (`:812` — "the same state
fingerprints differently on each side, so the counts are not summable"), or about the format version
(`:819`). Counts add; `firstAt` takes the min, `lastAt` the max.

---

## 4. The comparison

### `CoverageFinding`, `CoverageReport`

`CoverageFinding` (`packages/coverage/src/index.ts:196`): `fingerprint`, `id`, `count`, `share` —
"this state's share of everything recorded — what decides whether it is worth a scenario" (`:200`) —
and `diff`, the line worth printing.

`CoverageReport` (`packages/coverage/src/index.ts:214`):

| Field | Meaning |
| --- | --- |
| `uncovered` | recorded states no scenario produces. **THE finding**: what the region does that nobody previewed (`:215`) |
| `unreachable` | scenario states never recorded. "Weak — rare, seasonal or aspirational states look like this" (`:217`) |
| `covered` | count of states present on both sides |
| `keysDiffer` | `{ onlyRecorded, onlyDeclared } \| null` — the two sides are not comparable and the caller must say so (`:221`) |
| `systemic` | keys where the two sides are DISJOINT — one cause, not many findings (`:224`) |

### `compareCoverage()` — ranked by share, and that is not presentation

`compareCoverage(corpus, scenarioStates, declaredKeys)` (`packages/coverage/src/index.ts:247`). The
ranking is load-bearing (`:239`):

> RANKED BY SHARE, and that is not presentation. Production always holds states a scenario set does
> not, so a report that lists all of them is noise on the first run and ignored on the second — the
> same way a permanently red check teaches people to stop reading it. The number that decides whether
> a state deserves a scenario is how much of the traffic is in it.

### `systemic` — a missing column, not a missing scenario

A key is systemic when the two sides are **disjoint** on it: the scenarios have never shown this key
in ANY state production produces (`packages/coverage/src/index.ts:275`). "Every uncovered row agrees
on it" was the first rule and was too strict — production shows `busy` both true and false while the
flows show it neither way.

The reason the field exists at all was found by running the tool for the first time
(`packages/coverage/src/index.ts:224`): the review console's flows seed four of seven keys, its
application seeds all seven, so `busy` and `error` were `absent` in every previewed state and present
in every real one — every recorded row came back uncovered and the ranked list repeated
`busy:false error:null` eight times. "All true, and useless."

One filter keeps the whole check alive (`packages/coverage/src/index.ts:281`):

> THE FIRST PAINT IS NOT A STATE OF THE REGION, and counting it here silences this whole check. A
> wholly-absent fingerprint is what a region looks like before anything has been established — every
> page load passes through it […] Measured on peps: fifteen keys reported disjoint, then zero the
> moment that one state arrived — the strongest finding the tool had, switched off by the most
> ordinary state there is.

So `systemic` is computed over `settled` states only — those with at least one non-`absent` column
(`packages/coverage/src/index.ts:292`).

### `diffFromNearest()`

`diffFromNearest(fp, scenarioStates, ignore = [])` (`packages/coverage/src/index.ts:331`) prints only
the columns that differ from the nearest previewed state. A seven-key row is already hard to scan;
printing the five keys the reader already agrees with buries the answer (`:324`). Where everything
that differed was systemic, the row prints `(differs only in the systemic keys above)` (`:347`).

Systemic keys are subtracted from a row's diff **only where the row carries the key's ordinary
value** (`packages/coverage/src/index.ts:200`, computed at `:303`):

> Suppressing it outright was the first attempt and it deleted the finding: `busy` is systemic (no
> flow shows it at all), production is mostly `busy:false`, and the row that mattered was the 13% at
> `busy:true` — which came out looking identical to the rows around it. The ordinary value is noise
> repeated on every line; the deviation is the point.

---

## 5. The beacon: watching a region in production

### `observeRegionCoverage()`

`observeRegionCoverage(regionId, opts)` → `RegionCoverageHandle`
(`packages/coverage/src/index.ts:453`). Three properties stated at the definition:

- **OFF UNLESS CALLED** — "this is the one piece of motu designed to run in production, and a thing
  that runs in production has to be a thing someone switched on" (`:439`).
- **COALESCED TO THE END OF THE TURN** — a handler writing three keys passes through two states that
  never reached a screen; what is recorded is the state the region SETTLED in (`:445`, implemented
  with `queueMicrotask` at `:472`).
- **NOTHING HERE MAY THROW INTO THE APPLICATION** — "a corpus is a nice-to-have and the page is not"
  (`:450`). The fold and the sink are both wrapped (`:465`, `:558`).

It captures the state the region STARTS in before subscribing — "the one a seed establishes, and the
one flows skip" (`:475`).

`RegionCoverageOptions` (`packages/coverage/src/index.ts:380`) extends `FingerprintOptions`:

| Option | Meaning |
| --- | --- |
| `keys?` | override the derived key list. "Rarely right" (`:381`) |
| `limit?` | distinct-state cap (`:383`) |
| `sink?` | `(corpus) => void \| boolean \| Promise<boolean>` — where a novel state goes; `void` means "cannot know" (`sendBeacon`), a boolean is a synchronous verdict, a promise is one from a transport that read a response (`:386`) |
| `known?` | fingerprint ids already accounted for — never sent. "This is what turns the steady state into zero requests rather than merely fewer" (`:395`) |
| `remember?` | persist what this browser already reported, in `localStorage` under `motu:coverage:<regionId>` (`:399`, `:497`) |
| `maxReports?` | hard cap on beacons per session (`:406`) |
| `knownSource?` | a FUNCTION returning the CURRENT known set, asked once per session (`:412`) |
| `flushEveryMs?` | also flush on a timer. Off by default — "the page-leave flush is enough and costs nothing idle" (`:426`) |

`RegionCoverageHandle` (`packages/coverage/src/index.ts:430`): `corpus()`, `flush()`, and `stop()` —
which does NOT flush; call `flush()` first if you want what is held.

`knownSource` is a function, not a URL, on purpose (`:418`): "the same reason `StoreAdapter` is a pair
of functions and not a database: motu asks the question and the application answers it however it
likes. Nothing here knows what a bucket is." It is best-effort — one that throws or never resolves
leaves the build-time set in place.

### Cost is bounded by novelty, not by traffic

The flush sends only fingerprints in neither `known` nor `reported` (`packages/coverage/src/index.ts:521`);
if nothing is novel it returns without a request — "THE ZERO-REQUEST PATH, and the common one"
(`:525`). The consequence is stated plainly (`:478`):

> once every state a user reaches is known, THE BEACON NEVER FIRES. Cost is bounded by NOVELTY rather
> than by traffic — a new deploy produces a burst and then silence, and a busy day on unchanged code
> produces nothing at all.

What it costs in return (`:490`): in-session counts stop being the frequency signal, because a state
is reported once and never again. The signal moves to how many BEACONS name a fingerprint — one per
browser that ever reached it.

**Remember what landed, not what was attempted** (`packages/coverage/src/index.ts:529`). An earlier
version marked states reported before calling the sink and unconditionally, so a state reached while
the receiving end was down was lost from that browser permanently — not delayed. "Survivable while the
sink was a same-origin write to the app's own database. Not survivable once it forwards to a host that
can be a tunnel somebody closed: motu's own went down for 41 hours without anyone noticing." Only a
confirmed send is remembered (`:540`).

Flushes happen on `pagehide` and on `visibilitychange` to hidden — "the only moment a session's corpus
is complete", and `pagehide` fires where `unload` is unreliable (bfcache, mobile Safari)
(`packages/coverage/src/index.ts:566`).

### `beaconSink()`

`beaconSink(url)` (`packages/coverage/src/index.ts:602`) posts the corpus with `navigator.sendBeacon`,
falling back to a `keepalive` `fetch`. `sendBeacon` rather than `fetch` "because the flush that matters
happens as the page goes away: a fetch is cancelled on unload, and one kept alive with `keepalive`
still competes with the navigation" (`:591`). Its boolean is "THE WEAKEST USEFUL CONFIRMATION" —
it reports whether the browser QUEUED the request, "so `true` here is a hope and `false` is a fact"
(`:607`); treating `false` as failure stops a state being marked reported when the browser already
refused to try.

### `fetchKnown()`

`fetchKnown(url)` (`packages/coverage/src/index.ts:880`) is a `knownSource` that GETs a JSON array of
ids with `credentials: 'omit'`, returning `[]` on a non-OK response or a non-array body. "A
CONVENIENCE, not a dependency" — cache-friendly on purpose, because "this is the request that makes
the steady state cheap, so it must not itself become the cost" (`:871`).

### `knownIds()` — the one invariant that keeps the loop honest

`knownIds(scenarioStates, accepted = [])` (`packages/coverage/src/index.ts:864`) is the set to publish
back to clients: everything the flows cover, plus everything somebody looked at and accepted
(`:843`):

> THE ONE INVARIANT THAT KEEPS THE LOOP HONEST: nothing may promote a state to "known" except a flow
> or a person. The GET/POST cycle is a SUPPRESSION loop, not a learning one […] It would be trivial
> for a merge job to pass the corpus' own fingerprints as `accepted`, and the result would look like
> success: the report empties, the beacons stop, every state is "known". […] a system that can mark
> its own findings resolved reports nothing, and reporting nothing is indistinguishable from having
> nothing to report.

`accepted` is an explicit argument for that reason. There is no way to derive it.

---

## 6. Configured, not called

### The switch is baked; the addresses are not

`CoverageConfig` (`packages/coverage/src/index.ts:642`) — `enabled`, `endpoint`, `regions`, `known`,
`maxReports`, `knownUrl` — is applied by `configureCoverage(config)`
(`packages/coverage/src/index.ts:711`), which also fills core's seam via
`setRegionCoverageInstaller`. That is the ONE call the generated module makes, and the only reason the
package is ever imported (`:699`). It lives outside `@motu/core` because core used to call
`installRegionCoverage` unconditionally from `defineArchipelago`, which put the module in every
project's graph whether or not the project had enabled anything.

`motu archipelago sync` writes `archipelagos/coverage.generated.ts`
(`packages/cli/src/lib/archipelagos.mjs:25`) and ensures the hand-owned archipelago registry imports
it FIRST (`packages/cli/src/lib/archipelagos.mjs:66`, and see the ordering bug recorded at `:80`).
**THE IMPORT IS THE SWITCH** (`packages/cli/src/lib/archipelagos.mjs:45`): with coverage off, the file
is a deliberately empty `export {}` that names `@motu/coverage` nowhere, so no bundler ships it
(`:36`). With it on, the file emits exactly `configureCoverage({ enabled: true, regions? })`
(`packages/cli/src/lib/archipelagos.mjs:62`).

Core keeps only a seam: `markSandbox()`, `isSandbox()`, `setRegionCoverageInstaller()`,
`offerRegionToCoverage()` (`packages/core/src/sandbox.ts:26`–`:69`). The seam **remembers offers**
made before it was filled (`packages/core/src/sandbox.ts:40`), because module evaluation order in a
generated barrel decided whether coverage worked at all: "everything imports, everything type-checks,
the config is in the bundle, and no beacon is ever sent."

`defineArchipelago` offers each region as it is defined
(`packages/core/src/archipelago.ts:1152`), which makes the fold per-region by construction rather than
by wiring.

### `metaContent` — why the addresses live in the page

`metaContent(name)` (`packages/coverage/src/index.ts:692`) reads `<meta name="…" content="…">` from the
document. The reasoning (`packages/coverage/src/index.ts:672`):

> `motu island sync` bakes the coverage config into the generated island registry — and the LAGOON
> imports that registry. A published lagoon is one self-contained HTML file on a host anybody can
> reach, so anything in that config becomes a public string. Grepping a real one found exactly that:
>
>     wI({enabled:!0,endpoint:"/api/motu/coverage",knownUrl:"/api/motu/coverage/known",…})
>
> Inert there — the lagoon is a sandbox and refuses egress — but published all the same, and an
> internal route name is not something a preview page should hand out.

So the SWITCH is baked (not a secret, and it must survive into production) and the ADDRESSES are read
from the document at runtime:

```html
<meta name="motu-coverage-endpoint" content="/api/motu/coverage" />
<meta name="motu-coverage-known"    content="/api/motu/coverage/known" />
```

"A page that wants coverage renders two meta tags; the lagoon renders neither, so it has nowhere to
send anything even if the sandbox rule were removed. Defence that does not depend on a flag being
right." (`packages/coverage/src/index.ts:684`.)

`motu.config.json` enforces the same rule — `packages/cli/src/lib/config.mjs:148`:

```js
coverage: {
  enabled: cfg.coverage?.enabled === true,
  // NO ADDRESSES HERE. They would be baked into the generated island registry, which the lagoon
  // imports and publishes as a public page. The application renders them as meta tags; see
  // `metaContent` in @motu/coverage. `corpusUrl` is different — it is read by the CLI on a
  // developer's machine and never reaches a browser.
  corpusUrl: …,
  regions: …,
}
```

### `installRegionCoverage()` and the lagoon rule

`installRegionCoverage(regionId, { enums })` (`packages/coverage/src/index.ts:735`) is what the seam
calls. It returns `null` unless `enabled`; it honours `regions`, where `["*"]` **is every region, said
out loud** — "a wildcard is a decision an author can be held to, and it survives a region being added
later, which an explicit list silently excludes" (`:740`). It resolves the endpoint from config or the
meta tag, appends `region=` and `h=<keysHash>` to the known URL (`:750` — without them "every response
was `[]`, from the first day this existed"), and installs with `remember: true` and `maxReports`
defaulting to 4 (`:769`).

`coverageEgressAllowed(endpoint?)` (`packages/coverage/src/index.ts:726`) is false in the lagoon and
false with nowhere to send anything (`:716`):

> THE LAGOON RULE IS NOT A CONFIG FIELD, because no configuration should be able to arrange the
> alternative: `enabled: true` lives in a committed file, so it is true in the lagoon too, and a
> lagoon that beacons posts the states its own FLOWS produce into the corpus. The next comparison then
> reports them as covered in production — the tool validating itself, with a report that looks better
> rather than broken. […] The FOLD still runs there; only egress is refused.

`regionCoverage()` returns a copy of the installed handles for a lens or a test
(`packages/coverage/src/index.ts:776`); `resetRegionCoverage()` stops and clears them — a test seam,
because "the lagoon re-mounts regions constantly" (`:780`).

### `coverage.enums` — a fact about the key, on the archipelago

Whether a key is a closed set is declared beside the keys themselves
(`packages/core/src/archipelago.ts:227`):

```ts
coverage?: { enums?: readonly (keyof TRegion & string)[] };
```

Declared there rather than in `motu.config.json` "because it is a fact about the KEY — `viewMode` is
one of three words wherever this region is mounted — and it travels with the region rather than with a
deployment" (`packages/core/src/archipelago.ts:216`). It is **opt-in per key, never inferred**: "motu
cannot tell an enum from an email address by looking at one string, and guessing wrong writes a
customer's data into a coverage report" (`packages/core/src/archipelago.ts:224`).

The in-tree example is the review region of the host app
(`host-app/motu/src/archipelagos/review/review.archipelago.ts:41`):

```ts
coverage: { enums: ['viewMode'] },
```

with its own justification on the line above: "the difference between 'the viewer showed something'
and 'the viewer showed the ACCEPTED image' is exactly the kind of state a scenario set misses.
Everything else stays a category."

The CLI reads the same declaration statically, by regex over the archipelago file
(`packages/cli/src/commands/region-coverage.mjs:53`).

---

## 7. The server side

`@motu/coverage` publishes four entry points (`packages/coverage/package.json`): `.`, `./server`,
`./server/next`, `./server/next/known`.

### `@motu/coverage/server`

Two handlers over web-standard `Request`/`Response`, "so the same function serves a Next route
handler, a Vercel function, a Cloudflare Worker, Deno, Bun, or anything behind a small adapter"
(`packages/coverage/src/server/index.ts:18`).

The shape exists for three stated reasons (`packages/coverage/src/server/index.ts:1`):
**same origin for the browser** — "Pointing production browsers straight at the motu host would mean a
third-party domain in the page — CORS, ad blockers, corporate proxies, and a destination the
application's privacy policy does not mention. The destination is the disclosure, not the payload";
**the token never enters a page**, because the hop that carries it is server to server; and **no
database** — "An adopting application used to need a table, four functions, RLS policies, grants and a
migration — around four hundred lines before a single state was recorded."

`CoverageServerOptions` (`packages/coverage/src/server/index.ts:24`):

| Option | Env fallback | Meaning |
| --- | --- | --- |
| `host` | `MOTU_HOST_URL` | the motu host, e.g. `https://motu.example.ts.net` |
| `token` | `MOTU_COVERAGE_TOKEN` | a **write-only** ingest token for ONE repo — `motu-host access --repo <r> --ingest` |
| `repo` | `MOTU_COVERAGE_REPO` | which repo this application publishes as |
| `regions` | — | restrict which regions may be forwarded: "the difference between 'our regions' and 'whatever a stranger types'" (`:31`) |
| `maxBytes` | — | largest body accepted; default 256 kB (`:56`) |
| `readToken` | `MOTU_HOST_READ_TOKEN` | the host's READ secret, for serving the accepted set back. "Deliberately not the ingest token: that one is write-only so a credential sitting in an application's environment cannot read what the host holds for anyone" (`:40`) |

`handleCoverage(request, opts)` (`packages/coverage/src/server/index.ts:82`) **never throws**. Its
answers: `405` for a non-POST; `503` when the host, token or repo are unset — "MISCONFIGURATION IS
503, NOT 500. 'The host is not configured' is a deployment fact the operator can act on, and it must
not read as a bug in the page that reported" (`:93`); `400` for an unreadable, non-JSON or misshapen
body; `413` over `maxBytes`; `502` when the host answers non-OK or is unreachable — "the client learns
the report did NOT land, which is what stops it marking the state as reported and never offering it
again — the difference between a dropped report and a lost one" (`:127`); `200 { ok: true, states }`
otherwise. `CoverageServerResult` (`:51`) documents that answer shape: "the answer is always JSON,
never a throw."

Validation is **deliberately shallow** (`packages/coverage/src/server/index.ts:58`): the endpoint is
public, so it checks the shape it is about to forward and nothing about whether the contents are TRUE —
"Pretending otherwise would be security theatre in front of a store whose worst case is a worklist with
a junk row in it."

`describe(err)` (`packages/coverage/src/server/index.ts:151`) unwraps `fetch`'s `cause` chain so a DNS
miss, a refused connection, an expired certificate and an unroutable address are distinguishable —
"Cost us a round of guessing, which is the only reason it is worth the lines."

`handleKnown(request, opts)` (`packages/coverage/src/server/index.ts:181`) serves the accepted set. It
requires `region` and `h` query parameters, reads the host with the READ credential, filters to
strings, and caches `public, max-age=300, stale-while-revalidate=3600`. **An empty set is the safe
answer to everything, and the only one** (`:177`):

> Failing loudly would turn a reporting tool's outage into a broken page; claiming a state is known
> when it is not would silently delete a finding. At worst this costs one extra beacon; it can never
> cause a wrong silence.

### `@motu/coverage/server/next` and `/server/next/known`

`packages/coverage/src/server/next.ts` exports `POST`, `createCoverageRoute(opts)` and a reference
`dynamic`. `packages/coverage/src/server/next-known.ts` exports `GET`, `createKnownRoute(opts)` and
`dynamic`. Two modules rather than one, "because Next names route handlers by export"
(`packages/coverage/src/server/next-known.ts:7`).

`dynamic` **must be declared in the route file**, not re-exported: Next parses route segment config
statically at build time, so a re-export fails with "the exported configuration object needs to have a
very specific format" (`packages/coverage/src/server/next.ts:10`). A route that forwards must not be
statically evaluated, "or Next runs it once during the build and serves that answer forever" (`:22`).

Both mounts are thin on purpose: "Everything that could be wrong lives in `handleCoverage` […] If this
file grows logic, that logic stops being tested for the standalone deployment"
(`packages/coverage/src/server/next.ts:15`).

---

## 8. Privacy and safety

This is the one part of motu designed to run in production. What that costs is bounded by design, not
by policy:

- **A corpus contains no values, except where a key was allowlisted.** Every value is reduced to a
  category by `keyState` (`packages/coverage/src/index.ts:50`). `criteria: set`, never the criteria
  (`:17`).
- **Booleans keep their value** because "a boolean cannot identify anybody and `busy: true` is exactly
  the kind of state nobody writes a scenario for" (`packages/coverage/src/index.ts:26`).
- **Values survive only for allowlisted enums, and only if they are short.** `enums` is opt-in per key
  on the archipelago (`packages/core/src/archipelago.ts:227`), never inferred, and anything longer
  than `maxEnumLength` (default 32) falls back to `set`
  (`packages/coverage/src/index.ts:43`, `:56`).
- **`coverage.enabled` defaults to false** (`packages/cli/src/lib/config.mjs:149`): "a thing that runs
  in production is a thing somebody switched on" (`packages/cli/src/lib/config.mjs:145`, and the same
  sentence at `packages/coverage/src/index.ts:643`).
- **Coverage off means the package is not in the bundle.** The generated module names
  `@motu/coverage` only when enabled (`packages/cli/src/lib/archipelagos.mjs:36`).
- **The browser only ever talks to its own origin.** The forward to the motu host is server-to-server,
  and the ingest token appears in no bundle (`packages/coverage/src/server/index.ts:6`).
- **The ingest token is write-only**; reading the accepted set uses a different secret
  (`packages/coverage/src/server/index.ts:40`).
- **No addresses in committed config**, because the lagoon publishes what is baked
  (`packages/cli/src/lib/config.mjs:150`, `packages/coverage/src/index.ts:672`).
- **No token from config, ever** — the CLI reads `MOTU_COVERAGE_TOKEN` from the environment, uses it
  for one fetch, and writes it nowhere (`packages/cli/src/commands/region-coverage.mjs:235`).
- **The lagoon folds but never beacons** (`packages/coverage/src/index.ts:716`,
  `packages/core/src/sandbox.ts:17`).
- **A saved corpus is data, never an address.** `--save` refuses to write a file containing the token
  or the source URL (`packages/cli/src/commands/region-coverage.mjs:352`).
- **A coverage probe may never break a page.** The fold, the sink, the known fetch and the storage
  write are each wrapped (`packages/coverage/src/index.ts:450`, `:465`, `:510`, `:545`, `:558`).

---

## 9. The CLI: `motu archipelago coverage <id>`

```
motu archipelago coverage <id> [--corpus <f>]         states production reached that no flow previews
  --json --ids --accept <id> --fail-above <n>    machine-readable · print ids · accept one · gate
  --forget <id> | --forget-all                   remove a state the instrument recorded wrongly
```

(`packages/cli/src/run.mjs:66`.) The command reads the archipelago's declared keys, its
`coverage.enums`, and its flows from `<id>.evidence.ts`
(`packages/cli/src/commands/region-coverage.mjs:171`), fingerprints both sides, and prints a worklist.

**It does not write anything** — scenario skeletons go to stdout for someone to paste and fill in:
"Written to a file they would be a file full of TODO, which looks like coverage and rots — the same
reason `island create` stopped scaffolding `fixtures.mock.ts`"
(`packages/cli/src/commands/region-coverage.mjs:9`).

| Flag | What it does |
| --- | --- |
| `--corpus <f…>` | one or more corpus sources. A file path or an `http(s)` URL — "A URL IS A FILE HERE" (`:241`). Extra positionals after the region id are treated the same way (`:215`). Multiple sources are folded with `mergeCorpora` (`:328`). Defaults to `coverage.corpusUrl` from config (`:214`) |
| `--json` | the same findings as data: `region`, `declaration`, `keys`, `recorded`, `covered`, `systemic`, `uncovered[]` (with `id`, `share`, `count`, `differsBy`, `fingerprint`, `scenario` skeleton), `unreachable`, `keysDiffer`, `caveats`, `failAbove`, `pass` (`:474`). It **owns stdout** — prose is suppressed and errors go to stderr, because the first version printed the header before the JSON and broke parsing on the first character (`:155`) |
| `--ids` | print each uncovered state's `fingerprintId` under its row, "so the third answer to an uncovered state is reachable without deriving it by hand" (`:525`) |
| `--accept <id…>` | **a decision**: "we looked and chose not to preview this". POSTs the ids to `<host>/api/coverage/accept?repo=&region=&h=` under the **admin** token, never the ingest one — "nothing may promote a state to known except a flow or a person, and a reporting credential that could also accept would let the tool mark its own findings resolved" (`:402`) |
| `--forget <id…>` / `--forget-all` | remove a recorded state, which is **not** accepting it. "Accepting says 'we looked and chose not to preview this'. Forgetting says 'this was never true' — and the case it exists for is a mistake in the INSTRUMENT, not in the application." peps recorded `isCurrentWeek:true isOtherWeek:true`, where the second is the negation of the first — a state the page cannot compute (`:365`). POSTs to `/api/coverage/forget` (`:386`) |
| `--fail-above <n>` | gate CI: exit 1 when any uncovered state's share is at or above `n` percent (`:466`, `:554`). Without it the run is advisory and exits 0 — "An uncovered state is information, and a check that goes red for information is a check people learn to skip" (`:5`) |

Two more flags exist in the implementation but are absent from `--help`: `--save`, which writes the
merged corpus to `<lagoon>/src/coverage/<id>.json` for the lens to display, with the URL and token
assertion described above (`:343`), and `--token`, which supplies the bearer token for a URL corpus in
place of `MOTU_COVERAGE_TOKEN` (`:239`).

### Exit codes

| Code | When |
| --- | --- |
| `0` | compared, and nothing at or above `--fail-above` (or no threshold given) (`:559`) |
| `1` | uncovered states at or above the threshold (`:556`), or `keysDiffer` — "The same state fingerprints differently on each side, so nothing below is comparable" (`:443`) |
| `2` | could not run: no region id, no such archipelago, no readable flows, no corpus and no `corpusUrl`, a merge that refused, or a failed accept/forget (`:161`–`:232`, `:330`) |

"NO CORPUS IS NOT A PASS. Without one this can still say what the flows cover and print the known set
to publish, which is useful on its own — but it has examined no reality, and says so" (`:186`).

### What the report says beyond the ranking

- A **systemic** line per disjoint key: "`busy`: production is `[false | true]` and the flows only ever
  show `[nothing]` — not a missing scenario, a missing column. Widen the flow seeds" (`:457`).
- A **skeleton** under each uncovered row — `{ name: 'TODO', seed: { ...SEED, error: null } }` — typed
  from the flows' own seed where it can be, because a fingerprint says `empty`, which is true of `[]`,
  `''` and `{}` alike (`:120`, `:128`).
- **Three answers, not one**: write a scenario, `--accept` it, "or fix the application — an error
  state at 3% is a 3% error rate, not a missing preview" (`:528`).
- A caveat that is honest about a limit: the static comparison sees flow **seeds** and each step's
  `provide`, not the result of an `emit`, "whose result only a browser can know — a state reached that
  way is reported above as uncovered even though a flow does exercise it" (`:89`, `:536`). It errs
  toward reporting too much rather than too little.
- `unreachable` is reported and explicitly not actionable: "Rare, seasonal or aspirational states look
  like this, so it is worth reading rather than acting on" (`:544`).

### What a corpus source may be

`asCorpus(body)` (`packages/cli/src/commands/region-coverage.mjs:257`) accepts three shapes: the
host's read envelope `{ repo, region, corpus, declarations }` — unwrapped, and **the better source**,
because the host holds the whole corpus with real `firstAt`/`lastAt` (`:265`); a status page's
`{ top: [{ state, browsers | count }], declaration }` summary, "because a phone has to render it"
(`:245`); and a bare corpus. A root-relative path is diagnosed as a config mistake rather than a
missing file: "`coverage.corpusUrl` is fetched from a developer's machine, so it needs the origin
too" (`:303`).

---

## 10. End-to-end setup

The worked example is peps (`peps:motu/motu.config.json`).

**1. Turn it on in `motu.config.json`** — deployment facts only, and no addresses:

```json
{
  "coverage": {
    "enabled": true,
    "regions": ["*"],
    "corpusUrl": "https://motu.tail77d0a9.ts.net/api/coverage?repo=Scorbutics/peps_ta_boite_app&region=actions"
  }
}
```

`enabled` defaults to false (`packages/cli/src/lib/config.mjs:149`). `regions` may be a list or
`["*"]`, which means every region including ones added later
(`packages/coverage/src/index.ts:740`). `corpusUrl` is the one coverage address allowed in committed
config, because it is read on a developer's machine and never reaches a browser
(`packages/cli/src/lib/config.mjs:150`, `packages/cli/src/commands/region-coverage.mjs:189`) — and the
CLI rewrites its `region=` to whichever region you asked about (`:200`).

**2. Declare the closed sets on the archipelago**, beside the keys they are about:

```ts
export const reviewArchipelago = archipelago<ReviewRegion, keyof ElementTypes>()({
  id: 'review',
  coverage: { enums: ['viewMode'] },
  …
});
```

(`host-app/motu/src/archipelagos/review/review.archipelago.ts:41`;
type at `packages/core/src/archipelago.ts:227`.) Everything not listed stays a category. Nothing else
about coverage belongs here.

**3. Regenerate the region-side derived files** with `motu archipelago sync`. That writes
`archipelagos/coverage.generated.ts` and adds the one import line to the archipelago registry
(`packages/cli/src/lib/archipelagos.mjs:25`, `:66`). Verify it names `@motu/coverage` — if coverage is
off, the module is an empty `export {}` by design.

**4. Wire the server routes.** On Next, two files of two lines each — peps'
`peps:app/api/motu/coverage/route.ts` and `peps:app/api/motu/coverage/known/route.ts`:

```ts
export const dynamic = "force-dynamic"
export { POST } from "@motu/coverage/server/next"
```

```ts
export const dynamic = "force-dynamic"
export { GET } from "@motu/coverage/server/next/known"
```

Set `MOTU_HOST_URL`, `MOTU_COVERAGE_TOKEN` (write-only ingest, `motu-host access --repo <r> --ingest`)
and `MOTU_COVERAGE_REPO` in the server environment; add `MOTU_HOST_READ_TOKEN` unless the repo is
public on the host (`packages/coverage/src/server/index.ts:24`). On any other runtime, call
`handleCoverage`/`handleKnown` from `@motu/coverage/server` behind whatever adapter that host uses.

**5. Render the two meta tags** in the application's document head — peps does this in
`peps:app/layout.tsx`:

```html
<meta name="motu-coverage-endpoint" content="/api/motu/coverage" />
<meta name="motu-coverage-known" content="/api/motu/coverage/known" />
```

This is where the addresses live, and the reason is the lagoon
(`packages/coverage/src/index.ts:672`). The two halves of suppression run on different clocks: the
baked half changes only on a redeploy, the served half is why accepting a state takes effect at once
(`packages/coverage/src/server/index.ts:164`).

**6. Ship it, then ask.** Once real traffic has folded and beaconed:

```
motu archipelago coverage actions            # uses coverage.corpusUrl
motu archipelago coverage actions --ids      # print the fingerprint ids too
motu archipelago coverage actions --json     # the same findings as data
```

**7. Read `systemic` first.** A disjoint key is not a missing scenario but a missing column — widen
the flow seeds and re-run before writing any of the per-row scenarios
(`packages/cli/src/commands/region-coverage.mjs:457`, `packages/coverage/src/index.ts:224`).

**8. Answer each uncovered row, top of the list first.** Three answers, and they are different acts:

- **Write a scenario** — paste the printed skeleton into `<id>.evidence.ts`, fill in the TODOs, and
  the state moves to `covered` on the next run. See [evidence and testing](10-evidence-and-testing.md).
- **Accept it** — `motu archipelago coverage actions --ids` to get the id, then
  `motu archipelago coverage actions --accept '<id>'`. A decision, recorded under the admin token, and the
  known endpoint starts suppressing it immediately.
- **Fix the application** — "an error state at 3% is a 3% error rate, not a missing preview"
  (`packages/cli/src/commands/region-coverage.mjs:531`).

Use `--forget <id>` / `--forget-all` only for a state the instrument recorded wrongly — a state the
page cannot compute (`:365`). Forgetting is not accepting.

**9. Gate it in CI** once the worklist is triaged: `motu archipelago coverage actions --fail-above 5` exits
1 when any uncovered state holds 5% or more of recorded traffic. Leave it advisory while the list is
long; a permanently red check teaches people to stop reading it.

**10. Optionally, put the corpus in front of the lagoon.** `motu archipelago coverage <id> --save` writes
the corpus into the lagoon root so the build inlines it, and the lens shows the state you are looking
at against the states that happen (`packages/debug-overlay/src/coverage.ts:1`). That answers the
question the CLI cannot: *is the state I am looking at right now one that happens?* — "A scenario that
renders beautifully in a state production never reaches is the fixture-inventing-a-vocabulary failure,
and it passes every check motu has. Here it is one line."
