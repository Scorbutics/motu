// What a component already tells us about its own boundary.
//
// Every island file starts as the same transcription job: list the props, map the `on*` ones to event
// names, note which host capabilities the component reaches for. All three are facts about the
// component, sitting in its source — so scaffolding should read them, not ask a human (or an agent) to
// copy them and get one wrong. What is left for a person to decide is the part that is actually a
// decision: which region keys those props bind to, and what the events are called.
import { existsSync, readFileSync } from 'node:fs';
import { SyntaxKind } from 'ts-morph';
import { sourceFileAt } from './ts-project.mjs';
import { lagoonAliases } from './util.mjs';

/**
 * Everything an island reaches without being handed it — declared as `contract.effects`.
 *
 * CANDIDATES ONLY. These patterns are a heuristic for "looks like a host capability"; what makes one
 * ACTUALLY an effect is that the lagoon has to stand it in (`lagoonAliases()`), and the derivation
 * below intersects with that whenever a lagoon config exists. Keeping the patterns as the fallback
 * means a project with no lagoon still gets a sensible contract.
 */
const AMBIENT = [/^@\/lib\/contexts\//, /^@\/hooks\//, /^@\/lib\/services\//, /^@\/contexts\//, /^@\/services\//];

/** `onWeekProgress` -> `week-progress`. The author renames it if the region has a better word. */
/** React's callback convention, and the ONLY test either side of the contract may use. */
const CALLBACK = /^on[A-Z]/;

export function eventNameFor(prop) {
  return prop
    .replace(/^on/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/^-/, '')
    .toLowerCase();
}

/**
 * Read a component's boundary: input props, callback props (with a proposed event name), and the host
 * modules it imports.
 *
 * Returns null when the component cannot be found or its props cannot be resolved from the file alone
 * — scaffolding then falls back to an empty contract rather than inventing one.
 */
const contractCache = new Map();

/**
 * Does the component invoke this callback from an EFFECT — i.e. from rendering itself, rather than
 * from something a user does?
 *
 * The distinction decides what a runtime check may expect. An output fired inside `useEffect` MUST
 * fire when the island simply renders, so a region that renders and never sees it has a component
 * that stopped emitting. An output fired from a click handler need not fire at all during a
 * render-only pass, and demanding it would flag every well-behaved island in the project.
 *
 * CONSERVATIVE BY DESIGN: it answers "provably effect-driven", and anything it cannot prove is
 * reported as not effect-driven, so the runtime check stays silent rather than guessing. An indirect
 * call — the callback handed to a helper that invokes it later — reads as handler-driven here, which
 * costs a missed finding and never a false one.
 */
function calledFromEffect(fn, prop) {
  const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
  let found = false;
  fn.forEachDescendant((node) => {
    if (found) return;
    if (node.getKindName?.() !== 'CallExpression') return;
    const expr = node.getExpression?.();
    // `onProgress(...)` or `props.onProgress(...)` — the two spellings a destructured or bagged prop takes.
    const callee = expr?.getText?.() ?? '';
    if (callee !== prop && !callee.endsWith(`.${prop}`)) return;
    for (let a = node.getParent?.(); a; a = a.getParent?.()) {
      if (a.getKindName?.() !== 'CallExpression') continue;
      const hook = a.getExpression?.()?.getText?.() ?? '';
      if (EFFECT_HOOKS.has(hook.split('.').pop() ?? '')) {
        found = true;
        return;
      }
    }
  });
  return found;
}

export function readComponentContract(file, exportName) {
  if (!existsSync(file)) return null;
  // Reading a component means parsing it and resolving its props type, which is the expensive part of
  // a static verify. A sweep asks for the same file several times (props-match, effects, the generated
  // contract), so the answer is remembered for the life of the process.
  const cacheKey = `${file}::${exportName ?? ''}`;
  if (contractCache.has(cacheKey)) return contractCache.get(cacheKey);
  const result = readComponentContractUncached(file, exportName);
  contractCache.set(cacheKey, result);
  return result;
}

function readComponentContractUncached(file, exportName) {
  const sf = sourceFileAt(file, { allowJs: true, jsx: 4 });

  const fn =
    (exportName && (sf.getFunction(exportName) ?? sf.getVariableDeclaration(exportName)?.getInitializerIfKind(SyntaxKind.ArrowFunction))) ??
    sf.getFunctions().find((f) => f.isExported() && /^[A-Z]/.test(f.getName() ?? '')) ??
    null;
  if (!fn) return null;

  let names = [];
  const param = fn.getParameters()[0];
  if (param) {
    try {
      names = param
        .getType()
        .getProperties()
        .map((p) => p.getName());
    } catch {
      names = [];
    }
  }

  // A TYPE import is not a capability: it erases, the island never calls it, and declaring it as
  // declaring it would ask the lagoon to stand in for a module nothing reaches at runtime.
  //
  // Intersected with what the lagoon actually stands down, so this agrees with the `effects` check by
  // construction rather than by coincidence — see `lagoonAliases()` for the split this closed.
  const stoodDown = lagoonAliases();
  const effects = [...new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*import\s+type\b/.test(l))
      .map((l) => l.match(/from\s*['"]([^'"]+)['"]/)?.[1])
      .filter((spec) => spec && AMBIENT.some((re) => re.test(spec)))
      .filter((spec) => stoodDown === null || stoodDown.includes(spec)),
  )].sort();

  return {
    component: fn.getName?.() ?? exportName ?? null,
    // `fit` is motu's own injected prop, never part of an island's declared boundary.
    // ONE RULE FOR BOTH SIDES, and it is React's own: a callback is `on` FOLLOWED BY A CAPITAL.
    //
    // These two filters used to disagree — inputs excluded anything starting with `on`, outputs
    // required `/^on[A-Z]/` — so a prop whose name merely begins with those two letters
    // (`onboardingState`) was neither. It vanished from the contract silently: not an input, not an
    // event, and `props-match` then reported it as a callback nobody had mapped. A prop that decides
    // which of four cards a page renders, dropped because of two letters.
    input: names.filter((n) => !CALLBACK.test(n) && n !== 'fit'),
    output: names
      .filter((n) => CALLBACK.test(n))
      .map((n) => ({ prop: n, event: eventNameFor(n), effectDriven: calledFromEffect(fn, n) })),
    effects,
  };
}
