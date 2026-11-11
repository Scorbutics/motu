// `motu check — screens` (EXPERIMENTAL): do the declared screens hold together, and does every
// navigation a region asks for go somewhere?
//
// A screen is arrangement — a route, the app's own layout, a region per slot (`@motu/react`
// `screens.ts`). What can be checked without a browser:
//
//   screens-declared  the routes are unique and every slot names a region this project has
//   screen-coverage   a region on no screen is reachable only on its own (a warning: legitimate for a
//                     region the app embeds elsewhere, worth knowing about everywhere else)
//   nav-targets       every `host.navigate(...)` in an archipelago resolves to a declared screen — a
//                     button to an address nothing serves fails here, before anything runs.
//                     KNOW THE LIMIT: a target that MATCHES the wrong route passes. The demo's
//                     "+ New member" once navigated to `/member/edit`, which `/member/:memberId`
//                     serves — so the router opened a profile for a member called "edit", and this
//                     check would have accepted it too. Matching a route is not meaning the route.
//
// READ, NOT EVALUATED: the screens module imports React components and evidence, which plain node
// cannot load — the same reason the region checks parse evidence. So a target built in a way this
// does not follow is reported as UNREAD rather than passed: a check that looked at nothing has not
// passed.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { paths } from './util.mjs';
import { sourceFileAt } from './ts-project.mjs';

/** Where a project declares its screens: `src/screens/screens.ts`, beside `src/archipelagos/`. */
export function screensFile() {
  return resolve(dirname(paths.archipelagosDir), 'screens', 'screens.ts');
}

/** `/member/:id` -> a whole-path matcher, as `compileScreenPath` in @motu/react builds it. */
export function compilePath(path) {
  const source = path
    .replace(/\/+$/, '')
    .split('/')
    .map((part) => (/^:[A-Za-z_]\w*$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}/?$`);
}

/** Does any screen serve this target? `prefix` targets end where an id would be appended. */
export function served(screens, target) {
  const probe = target.kind === 'prefix' ? `${target.value}x-param` : target.value;
  return screens.some((s) => compilePath(s.path).test(probe));
}

const str = (node) =>
  node && (node.getKind() === SyntaxKind.StringLiteral || node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral)
    ? node.getLiteralText()
    : null;

/**
 * Every path a navigate argument can produce, or `{ unread }` when it is built some other way.
 *
 * Followed: a literal; `'/prefix/' + anything` (and a template starting with a literal); either side
 * of `?:` and `??`; `encodeURIComponent`-style calls inside a prefix; and `MAP[key]` where MAP is an
 * object literal const in the same file — every one of its values is a target.
 */
export function targetsOf(expr, sf) {
  if (!expr) return [{ unread: '(no argument)' }];
  const k = expr.getKind();
  const literal = str(expr);
  if (literal !== null) return [{ kind: 'exact', value: literal }];
  if (k === SyntaxKind.ParenthesizedExpression) return targetsOf(expr.getExpression(), sf);
  if (k === SyntaxKind.ConditionalExpression) return [...targetsOf(expr.getWhenTrue(), sf), ...targetsOf(expr.getWhenFalse(), sf)];
  if (k === SyntaxKind.BinaryExpression) {
    const op = expr.getOperatorToken().getText();
    if (op === '??' || op === '||') return [...targetsOf(expr.getLeft(), sf), ...targetsOf(expr.getRight(), sf)];
    if (op === '+') {
      // The leftmost operand of a `+` chain is the prefix.
      let left = expr;
      while (left.getKind() === SyntaxKind.BinaryExpression && left.getOperatorToken().getText() === '+') left = left.getLeft();
      const prefix = str(left);
      if (prefix !== null) return [{ kind: 'prefix', value: prefix }];
    }
  }
  if (k === SyntaxKind.TemplateExpression) {
    const head = expr.getHead().getLiteralText();
    if (head) return [{ kind: 'prefix', value: head }];
  }
  if (k === SyntaxKind.ElementAccessExpression) {
    const name = expr.getExpression().getText();
    const decl = sf.getVariableDeclaration(name);
    const init = decl?.getInitializer();
    if (init?.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const out = [];
      for (const prop of init.getProperties()) {
        const v = prop.getInitializer?.();
        out.push(...(str(v) !== null ? [{ kind: 'exact', value: str(v) }] : [{ unread: prop.getText() }]));
      }
      return out;
    }
  }
  return [{ unread: expr.getText() }];
}

/** Each declared screen: its id, its path, and the identifiers its slots name. */
function readScreens(sf) {
  const out = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== 'screen') continue;
    const spec = call.getArguments()[0];
    if (spec?.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const id = str(spec.getProperty('id')?.getInitializer?.());
    const path = str(spec.getProperty('path')?.getInitializer?.());
    const slots = spec.getProperty('slots')?.getInitializer?.();
    const regions = [];
    if (slots?.getKind() === SyntaxKind.ObjectLiteralExpression) {
      for (const p of slots.getProperties()) {
        const v = p.getInitializer?.();
        if (!v) continue;
        if (v.getKind() === SyntaxKind.CallExpression && v.getExpression().getText() === 'notARegion') continue;
        regions.push(v.getText());
      }
    }
    if (id && path) out.push({ id, path, regions, line: call.getStartLineNumber() });
    else out.push({ unread: true, line: call.getStartLineNumber(), text: (spec.getProperty('id')?.getText?.() ?? spec.getText()).slice(0, 60) });
  }
  return out;
}

/** Identifier (as a screens file names it) -> region id, from the archipelago files' own exports. */
function regionIdsByName(screensSf) {
  const byName = new Map();
  const dir = paths.archipelagosDir;
  if (!existsSync(dir)) return byName;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = resolve(dir, entry.name, `${entry.name}.archipelago.ts`);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const id = /\bid:\s*['"]([^'"]+)['"]/.exec(text)?.[1] ?? entry.name;
    for (const m of text.matchAll(/export\s+(?:const|function)\s+(\w+)/g)) byName.set(m[1], id);
  }
  // One level of local aliasing in the screens file: `const members = membersArchipelago();`.
  for (const decl of screensSf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (!init) continue;
    const callee = init.getKind() === SyntaxKind.CallExpression ? init.getExpression().getText() : init.getText();
    if (byName.has(callee)) byName.set(decl.getName(), byName.get(callee));
  }
  return byName;
}

/** Findings for the screens section, or null when the project declares no screens. */
/**
 * The screens this project declares, as `motu lagoon states` lists them: `{ screens, unread }`, or
 * null when there is no screens module. `unread` counts the `screen(...)` calls whose id or path is
 * not a string literal — said by the caller, never dropped.
 */
export function declaredScreens() {
  const file = screensFile();
  if (!existsSync(file)) return null;
  const all = readScreens(sourceFileAt(file, { allowJs: true, jsx: 4 }));
  return { screens: all.filter((s) => !s.unread), unread: all.filter((s) => s.unread).length };
}

export function screenFindings() {
  const file = screensFile();
  if (!existsSync(file)) return null;
  const findings = [];
  const add = (level, check, msg) => findings.push({ level, check, msg });
  const sf = sourceFileAt(file, { allowJs: true, jsx: 4 });
  const all = readScreens(sf);
  // A screen() whose id or path is not a plain string literal — a template, a helper's parameter — is
  // a screen this check did not see. Said, never dropped: it once reported "8 screen(s)" over 21, and
  // then called a route served by one of the unseen thirteen unserved.
  const unreadScreens = all.filter((s) => s.unread);
  const screens = all.filter((s) => !s.unread);
  if (unreadScreens.length)
    add(
      'warn',
      'screens-declared',
      `${unreadScreens.length} screen(...) call(s) NOT read — write \`id\` and \`path\` as string literals: ` +
        unreadScreens.map((s) => `${paths.rel(file)}:${s.line}`).join(', '),
    );
  if (!screens.length) {
    add('error', 'screens-declared', `${paths.rel(file)} declares no screen(...) — nothing was examined, so nothing is proved`);
    return { findings, screens };
  }

  // Unique routes: two screens on one path means the second can never open.
  const seen = new Map();
  for (const s of screens) {
    const prior = seen.get(s.path);
    if (prior) add('error', 'screens-declared', `screens "${prior}" and "${s.id}" both declare ${s.path} — the second can never open`);
    seen.set(s.path, s.id);
  }

  // Every slot names a region this project has.
  const byName = regionIdsByName(sf);
  const regionIds = new Set(
    existsSync(paths.archipelagosDir)
      ? readdirSync(paths.archipelagosDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
      : [],
  );
  const onScreen = new Set();
  for (const s of screens) {
    for (const name of s.regions) {
      const id = byName.get(name);
      if (!id) add('error', 'screens-declared', `screen "${s.id}" fills a slot with \`${name}\`, which is no archipelago this project exports`);
      else onScreen.add(id);
    }
  }
  if (!findings.some((f) => f.level === 'error' && f.check === 'screens-declared'))
    add('ok', 'screens-declared', `${screens.length} screen(s), unique routes, every slot a known region · ${onScreen.size} region(s) placed`);

  // A region REFERENCED by a placed region's root (`slots: { x: { region: 'equipage' } }`) is on the
  // screen too — inside its parent. Followed to a fixed point, so a reference of a reference counts.
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of [...onScreen]) {
      const archFile = paths.archipelagoFile(id);
      if (!existsSync(archFile)) continue;
      for (const m of readFileSync(archFile, 'utf8').matchAll(/\bregion:\s*['"]([\w-]+)['"]/g)) {
        if (regionIds.has(m[1]) && !onScreen.has(m[1])) {
          onScreen.add(m[1]);
          grew = true;
        }
      }
    }
  }
  const loose = [...regionIds].filter((id) => !onScreen.has(id)).sort();
  if (loose.length)
    add('warn', 'screen-coverage', `region(s) on no screen: ${loose.join(', ')} — reachable in the lagoon only on their own`);

  // Every navigation a region asks for resolves to a screen.
  let examined = 0;
  const unread = [];
  for (const id of regionIds) {
    const archFile = paths.archipelagoFile(id);
    if (!existsSync(archFile)) continue;
    const asf = sourceFileAt(archFile, { allowJs: true, jsx: 4 });
    for (const call of asf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!/\.navigate$/.test(call.getExpression().getText())) continue;
      for (const t of targetsOf(call.getArguments()[0], asf)) {
        examined++;
        if (t.unread) {
          unread.push(`${id}:${call.getStartLineNumber()} \`${t.unread}\``);
          continue;
        }
        if (!served(screens, t)) {
          add(
            'error',
            'nav-targets',
            `${id} navigates to ${t.kind === 'prefix' ? `${t.value}…` : t.value} (${paths.rel(archFile)}:${call.getStartLineNumber()}) — no declared screen serves it, so this control leads nowhere`,
          );
        }
      }
    }
  }
  if (unread.length)
    add('warn', 'nav-targets', `${unread.length} navigation target(s) built in a way this check does not follow, so NOT checked: ${unread.join(', ')}`);
  if (!findings.some((f) => f.check === 'nav-targets' && f.level === 'error'))
    add(
      examined ? 'ok' : 'warn',
      'nav-targets',
      !examined
        ? 'no region navigates anywhere — nothing was examined'
        : unread.length
          ? `the ${examined - unread.length} target(s) it could read resolve to a screen · ${unread.length} not checked (above)`
          : `every navigation target resolves to a screen · ${examined} target(s) checked`,
    );
  return { findings, screens };
}
