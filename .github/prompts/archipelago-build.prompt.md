---
description: Build a whole screen as a motu region with several agents at once — survey it, declare every slot and owner up front as `planned`, fan out one agent per island, then merge, write the region's flows and drive the result in the lagoon.
tools: ['codebase', 'editFiles', 'search', 'runCommands', 'problems', 'usages', 'changes']
---

# Build a screen with several agents

Build one SCREEN as a motu region, with several agents working at the same time. You write the
CONTRACT they build against and integrate what comes back; you do not write the islands. This is the
workflow the [`archipelago-build` agent](../agents/archipelago-build.agent.md) drives — read that agent
file and the repo `README.md` for the full rules; do not duplicate them here.

Shape of the run: survey the page → declare every slot, every owner and `planned: true` for all of
them → verify that the region is green before anything exists → one agent per slot in its own
worktree → merge (regenerate the generated files, never hand-merge them) → write the region's flows →
open the lagoon and drive it.

Use it when a new screen has three or more islands. For a single island use `island-create`; for
reading a page without building anything use `island-locate`.
