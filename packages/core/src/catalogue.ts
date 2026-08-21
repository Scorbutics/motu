// Membership as data, made checkable.
//
// `membership: 'catalogue'` says the island list is decided at runtime, so there is nothing in source
// to find. That was the honest thing to say when the only evidence was source. With the app's own
// captured data in reach (see `foreign-transport.ts`), a catalogue stops being unanswerable and
// splits into four questions that all have answers:
//
//   COVERED      a member type the data produces, with a declared island  -> the thing working
//   UNCOVERED    a member type the data produces, with NO declared island -> ERROR. the app renders
//                something the region does not model, and the lagoon frame is a lie by omission
//   SPECULATIVE  a declared island never seen in any capture              -> warn. maybe rare, maybe
//                dead; either way no evidence has ever exercised it
//   UNREACHABLE  a declared island whose type is not in the schema's own  -> ERROR. a typo or a
//                enum of possible members                                   removed enum member,
//                                                                           and it can never render
//
// UNREACHABLE is the one worth the file. The universe of member types is not guessed: a
// metadata-driven app codegens it (Twenty: `WidgetType` in `generated-metadata/graphql.ts`), so a
// declaration can be checked against the schema without running anything at all.

/** One member the data asked for, by its type discriminator. */
export interface CatalogueMember {
  type: string;
  /** Optional row id, so a report can point at which record produced it. */
  id?: string;
}

export interface CatalogueCheckInput {
  /** Island slots the region declares, keyed by the member type each one renders. */
  declared: readonly string[];
  /** Every member type the app CAN produce — read from the schema enum, never hand-listed. */
  universe?: readonly string[];
  /** Member types the capture actually contains. */
  present: readonly CatalogueMember[];
}

export interface CatalogueReport {
  covered: string[];
  uncovered: string[];
  speculative: string[];
  unreachable: string[];
  /** Share of the member types the data actually produces that the region models. */
  coverage: number;
}

export function checkCatalogue({ declared, universe, present }: CatalogueCheckInput): CatalogueReport {
  const declaredSet = new Set(declared);
  const presentTypes = [...new Set(present.map((m) => m.type))];

  const covered = presentTypes.filter((t) => declaredSet.has(t));
  const uncovered = presentTypes.filter((t) => !declaredSet.has(t));
  const unreachable = universe ? declared.filter((d) => !universe.includes(d)) : [];
  const unreachableSet = new Set(unreachable);
  const speculative = declared.filter((d) => !presentTypes.includes(d) && !unreachableSet.has(d));

  return {
    covered,
    uncovered,
    speculative,
    // a declaration outside the schema is unreachable, not merely unexercised; do not report it twice
    unreachable,
    coverage: presentTypes.length === 0 ? 0 : covered.length / presentTypes.length,
  };
}
