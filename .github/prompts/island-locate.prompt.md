---
description: Survey one page and locate its island candidates — what becomes an island, what stays host, who owns each shared key, and whether the page itself becomes an archipelago. Produces a ranked LOCATE REPORT and creates no files; island-create / island-extract execute it.
tools: ['codebase', 'search', 'usages', 'problems']
---

# Locate the islands on a page

Read ONE page and decide what motu should be told about it. This is the reading step before
`island-create` / `island-extract` — it produces a **report**, not files. This is the workflow the
[`island-locate` agent](../agents/island-locate.agent.md) drives — read that agent file, the repo
`README.md` and the host's motu rules block for the full rules; do not duplicate them here.

## Workflow (in order)

0. **Learn the project's shape** — `motu.config.json`: paths, `tagPrefix`, and above all `isolation`
   (`light` = an island wraps the app's OWN component; never propose lifting it into `ui/`). Read the
   existing archipelagos and `islands/` — a candidate may already exist, or belong to a region already.
1. **Enumerate what the page RENDERS** top-down: every panel, banner, card, navigator, control row,
   empty and error state — with its file and its props. Follow every prop to its source.
2. **Classify each region.** SHOWS content or ACTS ON the region → island (even if other islands sit
   inside it — DOM nesting says nothing about ownership; `slots` declares who fills which prop). Only
   ARRANGES, or is an overlay anchored to a DOM id, or is the composition root → host.
3. **Find the real couplings.** Each value is one of three things: island-owned (`writes`, event →
   key), host-fed/derived (`bind`, not a write), or page-local (not region state at all). The tell for
   a laundered coupling: the page computes something out of island A's callback and hands it to island
   B. Name the readers and the writer of every key; a key with no reader is not a key.
4. **Rank** by value (carries a coupling · is the page's content · keeps breaking · reused · about to
   change) ÷ cost (own fetching · host session/context/router · reaches `document` · drilled props ·
   cannot render from defaults · states no input can reach). Then override the ranking with one rule:
   **start with the island that carries the coupling.**
5. **Answer the archipelago question** — does the page become one (yes as soon as it holds islands;
   say whether it is genuinely coupled or a mix), and what is its SCOPE: the **page**, never a DOM
   subtree. Scoping to the div that "contains the islands" cuts through the one real coupling.
6. **Write the LOCATE REPORT**: archipelago id + verdict, the region-keys table (key | owner |
   readers | seeded?), ranked candidates (tag, slot, binds, writes, slots, scenarios, next verb),
   what stays host and why, the flows to declare in `<id>.evidence.ts`, and the unknowns/risks the
   lagoon cannot cover. Close with **the first move**: one candidate, one verb, one command.

Read-only: no scaffolding, no refactor, no invented keys or events, no islands proposed for
arrangement to inflate the count. The report is a proposal — a human picks the order and the scope.
