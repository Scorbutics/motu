// WHICH SLOTS A PIECE OF HOST SOURCE PLACES — one answer, for the two checks that ask.
//
// `integrate check` reads placements from the host's files with ts-morph; `island-composition` in
// `verify` asked the SAME question with `matchAll(/<[A-Z][A-Za-z0-9]*\.Island\s[^>]*?slot=…/)`. Two
// implementations of one question drift by construction: the regex could not see a multi-line
// element, a slot written with a template literal, or the difference between `slot="x"` and
// `slot={x}` — and it counted matches inside comments, which is how a commented-out example became a
// declared slot elsewhere in this file.
//
// The RULE is the interesting part and it belongs in one place: a STRING LITERAL names a slot
// statically, and anything else — `slot={expr}` — is a placement motu cannot attribute. Saying so
// beats guessing, and both callers now say the same thing.
import { Project, SyntaxKind } from 'ts-morph';

/** A fresh in-memory project per call: these are one-shot reads, and a shared cache would go stale. */
function parse(code, name = 'host.tsx') {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  return project.createSourceFile(name, code);
}

/**
 * The slot each `<X.Island slot="…">` in this source names.
 *
 * Returns `{ named, computed }` — `named` is the statically readable slots, `computed` counts the
 * placements whose slot is an expression, which a caller may want to report rather than ignore.
 * `tags` filters to the region's own island components when given; omit it to take every `*.Island`.
 */
export function placementsIn(code, tags = null) {
  const named = new Set();
  let computed = 0;
  let sf;
  try {
    sf = parse(code);
  } catch {
    // A syntax this project's own build accepts and ts-morph does not: read nothing rather than
    // guess. The caller reports "could not be read", which is the honest outcome.
    return { named, computed, parsed: false };
  }
  const elements = [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ];
  for (const el of elements) {
    const tag = el.getTagNameNode().getText();
    if (tags ? !tags.includes(tag) : !/^[A-Z][A-Za-z0-9]*\.Island$/.test(tag)) continue;
    const init = el.getAttribute?.('slot')?.getInitializer?.();
    if (init?.getKind?.() === SyntaxKind.StringLiteral) named.add(init.getLiteralText());
    else if (init) computed++;
  }
  return { named, computed, parsed: true };
}

/**
 * The slot an element's `slot` attribute names: the string, `null` for a computed one, `undefined`
 * where there is no attribute at all.
 *
 * Three answers rather than two, because the caller treats them differently: a computed slot is
 * REPORTED (motu cannot attribute it), and a missing one is simply not a placement.
 */
export function slotNameOfElement(init, attr) {
  if (init?.getKind?.() === SyntaxKind.StringLiteral) return init.getLiteralText();
  if (init?.getKind?.() === SyntaxKind.JsxExpression) return null;
  return attr ? null : undefined;
}
