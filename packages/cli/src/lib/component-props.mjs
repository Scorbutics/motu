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
    output: names.filter((n) => /^on[A-Z]/.test(n)).map((n) => ({ prop: n, event: eventNameFor(n) })),
    ambient,
  };
}
