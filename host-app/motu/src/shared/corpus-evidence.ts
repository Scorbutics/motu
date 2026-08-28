// The corpus region's invented data, in ONE place.
//
// Both the islands' scenarios and the region's flows need these rows, and anything both need lives in
// a module they import with a RELATIVE specifier — `@/` does not resolve in the loaders that read
// evidence files, and the failure is SILENT: the island keeps its scenarios in one check and loses
// them in another.
//
// Typed against the APP's own vocabulary with `import type`, which erases at runtime so the loaders
// are unaffected — and a renamed field then fails the build here instead of quietly previewing a
// shape the region no longer has.
import type { CorpusState } from '../../../app/corpus/corpus-region'

/**
 * The states a real `signin` corpus holds, in the shape production records them.
 *
 * The KEYS are the signin region's own (`signingIn`, `signInError`, `authError`, `returnTo`,
 * `destination`) and the VALUES are motu's `KeyState` categories, not invented words. A fixture that
 * makes up a vocabulary the application does not use is the one failure no mechanical check catches —
 * it contradicts nothing and passes everything.
 */
export const CORPUS_STATES: CorpusState[] = [
  {
    id: 'authError=null,destination=null,returnTo=null,signInError=null,signingIn=false',
    fingerprint: {
      signingIn: 'false',
      signInError: 'null',
      authError: 'null',
      returnTo: 'null',
      destination: 'null',
    },
    count: 812,
    share: 0.79,
    accepted: true,
  },
  {
    // The refusal that came back from GitHub. Accepted: a flow previews it, so it is known.
    id: 'authError=set,destination=null,returnTo=set,signInError=null,signingIn=false',
    fingerprint: {
      signingIn: 'false',
      signInError: 'null',
      authError: 'set',
      returnTo: 'set',
      destination: 'null',
    },
    count: 154,
    share: 0.15,
    accepted: true,
  },
  {
    // THE FINDING, and the reason this screen exists: production reached a state where the handoff
    // failed WHILE a destination had already been resolved. No scenario previews that combination.
    id: 'authError=null,destination=set,returnTo=set,signInError=set,signingIn=false',
    fingerprint: {
      signingIn: 'false',
      signInError: 'set',
      authError: 'null',
      returnTo: 'set',
      destination: 'set',
    },
    count: 61,
    share: 0.06,
    accepted: false,
  },
]

/** How many of the rows above nobody has accepted — derived, so the two can never disagree. */
export const CORPUS_UNACCEPTED = CORPUS_STATES.filter((s) => !s.accepted).length

/** The region the invented corpus is about. */
export const CORPUS_REGION_ID = 'signin'
