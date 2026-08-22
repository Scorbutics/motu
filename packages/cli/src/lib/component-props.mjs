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

/** Host capabilities an island reaches for without being handed them — declared as `contract.ambient`. */
const AMBIENT = [/^@\/lib\/contexts\//, /^@\/hooks\//, /^@\/lib\/services\//, /^@\/contexts\//, /^@\/services\//];

/** `onWeekProgress` -> `week-progress`. The author renames it if the region has a better word. */
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
  // a static verify. A sweep asks for the same file several times (props-match, ambient, the generated
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
  // ambient would ask the lagoon to stand in for a module nothing reaches at runtime.
  const ambient = [...new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*import\s+type\b/.test(l))
      .map((l) => l.match(/from\s*['"]([^'"]+)['"]/)?.[1])
      .filter((spec) => spec && AMBIENT.some((re) => re.test(spec))),
  )].sort();

  return {
    component: fn.getName?.() ?? exportName ?? null,
    // `fit` is motu's own injected prop, never part of an island's declared boundary.
    input: names.filter((n) => !n.startsWith('on') && n !== 'fit'),
    output: names
      .filter((n) => /^on[A-Z]/.test(n))
      .map((n) => ({ prop: n, event: eventNameFor(n), effectDriven: calledFromEffect(fn, n) })),
    ambient,
  };
}
