# motu documentation

The reference set for motu: what it is, how to drive it, and how to adopt it into an application that
already exists.

Read in order if you are new; jump straight in if you are not.

## Orientation

| | |
|---|---|
| [01 — Concepts and terminology](01-concepts.md) | island, ocean, archipelago, lagoon, mainland, region, slot, key. Read this first; every other page assumes it. |
| [02 — Getting started](02-getting-started.md) | `motu init` to a working lagoon, the first island, the iteration loop. |

## Reference

| | |
|---|---|
| [03 — CLI reference](03-cli-reference.md) | every command, every flag, and which tier it belongs to. |
| [04 — Configuration](04-configuration.md) | `motu.config.json`, key by key, with defaults and what each one changes. |
| [05 — Archipelagos and regions](05-archipelagos-and-regions.md) | declaring a region: islands, slots, keys, `root`, `hostSlots`, channels. |
| [plan-key-ownership](plan-key-ownership.md) | the design record for key ownership, eject and the ownership checks. |

## Working with it

| | |
|---|---|
| [06 — Composition and adoption](06-composition-and-adoption.md) | `X.Root` vs `X.Island`, and the staged path for adopting motu into an existing codebase. |
| [14 — Migrating an ocean](14-ocean-migration.md) | The legacy-host path: coexistence, `legacy-toggle`, inbound channels, and how the ocean recedes. |
| [07 — Checks and verification](07-checks-and-verification.md) | every check id, the three tiers, the three exit codes. |
| [08 — The lagoon](08-lagoon.md) | dev, states as addresses, publish, serve, hosting, visual baselines. |
| [09 — Coverage](09-coverage.md) | the production fold: fingerprints, corpus, `region coverage`, and the `@motu/coverage` API. |
| [10 — Evidence and testing](10-evidence-and-testing.md) | scenarios, flows, evidence files, and what each check reads. |

## Integrating

| | |
|---|---|
| [11 — Contract and backend](11-contract-and-backend.md) | the contract seam, transports, fixtures, codegen. |
| [12 — Hosts and adapters](12-hosts-and-adapters.md) | Next, AngularJS, none; `@motu/adapter-next`; `removal-check`. |
| [13 — Agents and skills](13-agents-and-skills.md) | the shipped skills, host rules, and the multi-agent workflow. |

## Design records

Not reference — the reasoning behind a decision, kept because the reasoning is the part that gets
lost. [plan-lagoon-host](plan-lagoon-host.md) · [twenty-robustness-test](twenty-robustness-test.md)
