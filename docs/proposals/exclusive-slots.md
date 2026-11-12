# Proposal — exclusive root props

**Status:** implemented. The reference is now [05 — `exclusive`](../05-archipelagos-and-regions.md#exclusive--alternatives-the-page-cannot-pass-together);
this page keeps the reasoning and the open questions.

## As built — where it differs from the sketch below

- **`when`/`unless` pairs do NOT derive a group.** The sketch derived one and made restating it an
  error. Built that way, every adopting page that already passes `authError={e ? … : null}
  form={e ? null : …}` would have stopped compiling with no declaration change of its own, because
  `when`/`unless` were documented as the lagoon's condition only. So the two stay separate: `when`/
  `unless` is the lagoon's choice, `exclusive` is the page's guarantee. An uncovered pair is a
  **warning** that names the `exclusive` line to add, so opting in is the project's decision.
- **The runtime report is `console.error`, not a ledger.** `page-render` sees two islands of a group
  directly in the DOM it already counts. A host-slot or pass-through member is visible only to the
  type and to that console line.
- **Root props are not read from the component.** A member that is neither a slot nor a host slot is
  trusted as a pass-through. `exclusiveProblems` accepts the root's prop names, and wiring
  `component-props.mjs` into the check is the follow-up that turns `unknown` on.
- **`integrate check` needed no change.** It already read slots placed through a spread, after an
  adopting project's page used exactly this shape.
- **Dogfooded on `host-app`'s review region:** `exclusive: [['accept', 'connect']]`. Declaring it made
  `app/console/console-screen.tsx` fail `tsc` on its two ternaries over `viewer`, and it now passes one
  spread.
- **Not built:** open questions 1–4 below. In particular the lagoon shows the FIRST alternative, and
  the others are not yet addresses of their own.

## The gap

Moving a page to `root` turns a ternary into two props:

```tsx
// before — exclusive by construction
{weeksLoaded ? <WeekNavigator … /> : <Skeleton … />}

// after — two props, nothing says at most one is set
weekNav={weeksLoaded ? <WeekNavigator … /> : null}
weekNavPlaceholder={weeksLoaded ? null : <Skeleton … />}
```

Today the docs say "keep the ternary and pass one node". That is advice, and nothing checks it.

motu already has half a declaration. The object form of `slots` takes `when` / `unless`
(`packages/core/src/archipelago.ts`, `slotShows`), but it is **the lagoon's condition only**: `<X.Root>`
ignores it (`create-region.tsx`, "The page decides exclusivity ITSELF"), and it can only pair two
ISLANDS decided by a REGION KEY. acme's case pairs an island with a host `Skeleton`, decided by host
state (`weeksLoaded`). Neither half is expressible.

## The declaration

One field on the archipelago, naming ROOT PROPS (the app's vocabulary, the left side of `slots`):

```ts
root: ActionsPageLayout,
slots:     { weekNav: 'week-nav', actions: 'week-actions' },
hostSlots: { weekNavPlaceholder: Skeleton },
exclusive: [['weekNav', 'weekNavPlaceholder']],   // at most one is non-null, per render
```

- A member may be an island slot, a host slot, a `{ region }` slot or a pass-through prop. A
  pass-through prop is what makes the island-or-skeleton case expressible.
- **Derived groups are not redeclared.** Two slots with `when: 'k'` and `unless: 'k'` are already an
  either/or, so the group is derived from them. Declaring it again is an error ("declare only what you
  decided").
- Needs a `root`. A region placed island by island with `<X.Island>` has no single place where the
  page passes all the props (see open questions).

## Enforcement — four places, cheapest first

**1. `tsc` (the guarantee).** `RootPropsOf<C>` intersects one union per group, where each member allows
one prop and forces the others to `null | undefined`:

```ts
type Group = { weekNav?: ReactNode; weekNavPlaceholder?: null }
           | { weekNav?: null; weekNavPlaceholder?: ReactNode };
```

Spiked against today's `RootPropsOf` shape, including its `& Record<string, unknown>`:

| page writes | result |
|---|---|
| `weekNav={r ? W : null} weekNavPlaceholder={r ? null : S}` (the demoted shape) | **compile error** |
| `{...(r ? { weekNav: W } : { weekNavPlaceholder: S })}` | compiles |
| both set literally | **compile error** |
| one set, the other omitted | compiles |

So the guarantee goes back into the type system, where the ternary had it. The page keeps one
condition, written as one spread.

**2. `<X.Root>` at runtime (the cast).** `as any` defeats tier 1. If more than one member of a group is
non-null in a render, Root reports it: a console error in dev, plus an entry in a ledger that
`page-render` reads. A few lines, beside the existing `value == null` branch.

**3. `motu check`, statically (the declaration).** A new `exclusive` check reports:
- a name that is not a prop of the root, read through `component-props.mjs`, which already reads
  props;
- a group of fewer than two members;
- a prop that belongs to two groups;
- a group that restates a derived `when`/`unless` pair;
- a group on a region with no `root`.

Its `ok` passes the number of groups, so a region with none reports `skip`, not `pass`.

**4. Runtime checks (the page and the lagoon).**
- **`page-render`:** today it warns on any slot the page did not reach, and exempts `when`/`unless`
  slots (`conditionalSlots`). This generalises the exemption to groups. One member reached is ok, an
  alternative the page did not take is not a miss, none reached still warns, and two reached is an
  **error**.
- **`integrate check`:** a group member placed inside a ternary is not "conditionally placed". The
  condition is the declaration.
- **The lagoon:** it mounts every declared slot today, so it would draw navigator *and* skeleton,
  which is a screen the app can never show. It should mount the group's first member, and list every
  other member as its own address in `motu lagoon states`. Each alternative then becomes a state you
  can open, which is the flow-navigation win applied to branches.

## What it does not do

- **It allows zero.** "At most one" is the ternary-with-`null` case. "Exactly one" (a navigator OR a
  skeleton, never a hole) is stronger, and is an open question below.
- **It leaves with motu.** `removal-check` rewrites `<X.Root>` back to the layout, and the spread
  ternary is plain JSX, so the page still typechecks. The *type* guarantee is motu's, though, so the
  layout's own props go back to being independent. Say so in `removal-check`'s report, not in a
  comment.
- **It cannot see inside the root.** A layout that renders `{weekNav}{weekNavPlaceholder}` is fine,
  because one is null. A layout that derives a third thing from both is out of reach, as it is today.

## Tests — including the hatch

- **Type tests** in `packages/core/test`: the four rows of the table above, as `@ts-expect-error` and
  plain lines.
- **Mutation, following "test the hatch":** put acme's two-ternary shape back into `host-app`, or into a
  fixture region, and watch `tsc` refuse it. Then add `as any` and watch `page-render` refuse it.
  Neither may be skipped.
- **The lagoon:** the group's second member appears in `motu lagoon states`. An address naming a
  non-member refuses to render, as every unresolved address does.

## Docs to change when it lands

- **05:** the `exclusive` field, beside `slots`.
- **06:** replace "keep the ternary and pass one node" with the declaration.
- **13** and `host-rules.md`: the same, for agents.
- **03:** `adopt-root`, see below.

## Open questions

1. **Exactly one.** Is it worth a flag, e.g. `exclusive: [{ of: [...], required: true }]`, with no
   optional props in the union? acme's navigator renders nothing when there are no weeks, so it
   would not fit there.
2. **The lagoon address syntax** for a non-default alternative. It should be a what-if on the region,
   not a new parameter.
3. **Regions without a root.** Could tier 2 count mounted islands per group through `<X.Island>`? That
   is runtime only, with no tier 1.
4. **`adopt-root`.** It currently refuses a frame that puts two islands in one prop. When it splits an
   either/or into two props, should it write the `exclusive` group itself? That is the moment the
   guarantee is lost, so it is the right moment to keep it.
