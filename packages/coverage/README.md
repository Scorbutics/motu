# @motu/coverage

Which states a region has **actually been in**, against the states its flows **preview**.

Every other check in motu compares a region to its declaration: does it do what it says, does the
host place what it names, has anything drifted. This asks a different question, and the only
environment that can answer it is the one nobody is watching.

> A scenario set describes the states somebody thought of. Production is the only witness to the ones
> nobody did.

The output is a **worklist, not a verdict** — which is why the CLI exits 0 by default. An uncovered
state is information, and a check that goes red for information is a check people learn to skip.

## Why a region is the only thing this could work on

Every observability tool has to **infer structure** from unstructured input — traces, logs, arbitrary
payloads. That is why they are expensive, why they leak, and why comparing their output to your tests
is guesswork.

motu infers nothing. The archipelago **declares its keys**, so a region's state reduces to a fixed row
of categories:

```
busy:true error:null repos:set selectedRepo:set selectedShot:absent shots:empty viewMode:= last
```

Three properties fall out, none of which a general-purpose tool can have:

- **Nothing to flood.** You accumulate distinct *states*, not events. The ten-thousandth user in the
  same state increments an integer.
- **Almost nothing to leak.** `shots:empty` does not say which shots; `error:set` does not say which
  error. A value survives only for a key the archipelago explicitly declares a closed set, and only
  when short.
- **Apples to apples.** A scenario *is* a seed of region keys. The same function fingerprints both
  sides, so the comparison needs no reconciliation step.

It is a **coverage report that accumulates**, not a watchdog. Nothing is real-time, nothing has to be
reliable, and a dropped beacon costs nothing.

### The limit, stated plainly

It sees **the declaration, not the UI**. State an island keeps in local `useState` is invisible. A
region that declares three keys and holds nine will report thin coverage of three. So a clean report
means *"the declared state space is fully previewed"* — never *"the screen is fully tested"*.

## Turning it on

Nothing in your application calls this package. `motu island sync` writes the switch into the
generated island registry, and `defineArchipelago` picks each region up as it mounts:

```jsonc
// motu.config.json — deployment facts only
"coverage": {
  "enabled": true,
  "endpoint": "/api/motu/coverage",          // where a beacon POSTs
  "knownUrl": "/api/motu/coverage/known",    // optional: the accepted set, refreshed without a deploy
  "regions": ["actions"]                     // optional: all regions when absent
}
```

```ts
// the archipelago — a fact about the KEY, so it travels with the region
coverage: { enums: ['viewMode'] }
```

`enums` names the keys whose **value** may be kept, because it is a closed set the application chose.
Opt-in per key, never inferred: motu cannot tell an enum from an email address by looking at one
string, and guessing wrong writes a customer's data into a coverage report.

### Why not a build constant

`__MOTU_DEBUG__` exists so the seam lens' whole import tree **dead-code-eliminates** — the lens must
not ship. Coverage is *meant* to ship; running in production is the point of it. So elimination is not
the goal, and a define would only oblige every host's bundler to declare a global or fail with a
`ReferenceError`.

The saving comes from the package boundary instead: with coverage off, **nothing in the project names
`@motu/coverage`**, and a module nothing imports is a module nothing ships. Core holds only a
ten-line seam (`offerRegionToCoverage`) that stays a dead branch.

## What it costs to run

Three multipliers stack, cheapest first:

1. **The fold** — a session collapses to distinct states before anything is considered.
2. **The known set** — flow-covered and accepted fingerprints ship in the bundle. A state in it is not
   a finding, so it is never sent.
3. **`remember`** — `localStorage` stops a returning browser re-sending what it already reported,
   turning *novel per session* into **novel per browser**.

The consequence is not "fewer requests": once every state a user reaches is known, **the beacon never
fires**. Cost is bounded by *novelty* rather than by traffic — a deploy produces a burst and then
silence, and a busy day on unchanged code produces nothing.

What it costs in return: in-session counts stop being the frequency signal. The signal moves to **how
many beacons name a fingerprint** — one per browser that ever reached it — which is the better number
anyway.

Plus a hard `maxReports` cap per session, because this runs where nobody is watching.

## The rules that keep it honest

Three failures with the same shape, each guarded:

**The lagoon may never beacon.** `enabled: true` lives in a committed file, so it is true in the
lagoon too — and a lagoon that beacons posts the states its own *flows* produce into the corpus. The
next comparison would report them as covered in production. That is a framework rule (`isSandbox()`),
not a config field, because no configuration should be able to arrange it. The **fold** still runs
there; only egress is refused.

**A fingerprint may never become a scenario.** The corpus is a worklist, not a source. Auto-expanding
a fingerprint produces evidence nobody chose, with values nobody vetted — fake evidence, which is
worse than none. `motu region coverage` *prints* skeletons to stdout; it writes nothing.

**Nothing may promote a state to "known" except a flow or a person.** The GET/POST cycle is a
**suppression** loop, not a learning one. A merge job passing the corpus' own fingerprints as
`accepted` would look like success — the report empties, the beacons stop — and would be the tool
marking its own findings resolved. A system that can do that reports nothing, and reporting nothing is
indistinguishable from having nothing to report.

## Reading the report

```
motu region coverage actions --corpus corpus.json
```

```
  ! systemic   weekMissions: production is [absent | empty] and the flows only ever
               show [set] — not a missing scenario, a missing column

   16.7%  busy:true
          { name: 'TODO', seed: { ...SEED, busy: true } }
    8.3%  shots:empty
          { name: 'TODO', seed: { ...SEED, shots: [] } }

PASS  2 covered, 5 to triage (advisory — pass --fail-above to gate)
```

**Systemic** is the finding behind the findings: a key where the two sides are *disjoint* — the
scenarios have never shown it in any state production produces. That is not a missing scenario but a
missing **column**, and it means every flow runs against a region shaped differently from the one
users get.

**Ranked by share**, because production always holds states a scenario set does not. Listing them all
is noise on the first run and ignored on the second.

**Skeletons are typed from the flows' own seed.** A fingerprint says `empty`, which is true of `[]`,
`''` and `{}` alike — but the flows already establish that key with a real value, so the skeleton says
`[]` rather than offering three guesses.

### Three answers to an uncovered state

Not one. If "write a scenario" were the only answer you would end up with hundreds of them.

1. **Write a scenario** — it matters, and you want it previewed and regression-locked.
2. **Accept it** — it happens and nobody needs a picture of it. Its own act, for the same reason
   accepting a snapshot is: *"we looked and chose not to"* must not be the same state as *"nobody
   looked"*.
3. **Fix the application** — `error:set` at 3% does not primarily mean "add an error scenario". It
   means the host is failing 3% of the time. Reaching for a scenario first is treating the
   thermometer.

All three close the loop the same way: the state stops being reported. So the list only grows when
something genuinely new happens.

### Exit codes

    0  advisory, or nothing at or above --fail-above
    1  uncovered states past the threshold you set
    2  could not run — no corpus, unreadable flows, a store that did not answer

"No corpus" is a **2**, never a pass: nothing was examined, so nothing is proved.

### What it cannot see

A state reached through `emit` goes via an island, so only a browser knows the result. The command
reads `provide` steps and accumulates them; anything behind an `emit` is reported as uncovered even
though a flow does exercise it. **A false positive, printed with its cause.** The fix is for the
browser flow lane to contribute its own fingerprints.

## Storage, and why motu knows nothing about yours

The boundary is the one motu already draws for `Transport`, `StoreAdapter`, `HostBridge` and the seam
lens: **motu defines the question, the application answers it.**

| motu supplies | you supply |
| --- | --- |
| the corpus format (`v`, `keysHash`, `regionId`, `keys`, `entries`) | a `sink` — `beaconSink(url)` is a convenience |
| `mergeCorpora` — the fold, pure | wherever beacons land |
| `knownIds` — what to publish back | a `knownSource` — `fetchKnown(url)` is a convenience |

`mergeCorpora` living here is the load-bearing choice: it is arithmetic on motu's own format, and
every backend would otherwise reimplement it slightly differently — which is how two corpora stop
being comparable.

### `keysHash` is the declaration

Add a key to a region and every state fingerprints differently, so old rows are not comparable to new
ones. They are bucketed by the hash of the sorted key list rather than mixed. Two consequences:

- **Cleanup is one statement** (`DELETE ... WHERE keys_hash <> …`), never a question about which rows
  still mean something.
- **Drift is cheap to detect.** `mergeCorpora` refuses to fold across a mismatch and
  `compareCoverage` reports it, naming both hashes rather than silently comparing incomparable things.

Nothing ever enumerates the state space. A corpus is **sparse** — motu's own review console has ~2,900
possible states and 7 recorded ones.

## API

```ts
// the fold
fingerprintRegion(keys, read, { enums })   // → RegionFingerprint
declaredRegionKeys(regionId)               // → the archipelago's own key list
CoverageRecorder                           // bounded, dedupes by fingerprint
observeRegionCoverage(regionId, opts)      // subscribe + flush; what configureCoverage installs

// the wire
beaconSink(url)                            // sendBeacon, fire-and-forget
fetchKnown(url)                            // a cacheable GET
keysHash(keys)                             // the declaration stamp

// the comparison
compareCoverage(corpus, scenarioStates, declaredKeys)   // → uncovered, systemic, unreachable
mergeCorpora(corpora)                                   // pure fold; refuses across declarations
knownIds(scenarioStates, accepted)                      // what to publish back

// wiring
configureCoverage(config)                  // the generated registry calls this, and nothing else does
```

`sendBeacon` rather than `fetch`: the flush that matters happens as the page goes away, and a fetch is
cancelled on unload. A beacon is queued by the browser either way, and cannot be read — correct here,
since nothing about a corpus needs a response. **Nothing in this path may throw into the
application:** a coverage probe that breaks a page is worse than no coverage.
