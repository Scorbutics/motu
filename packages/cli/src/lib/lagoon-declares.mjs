// WHAT A REGION'S LAGOON OVERRIDES DECLARE, read by PARSING rather than by matching.
//
// One question so far: does this region declare a `page` — the application's own page module — so
// that `?view=page` is a real address for it and `motu lagoon states` can print it?
//
// PARSED, NOT MATCHED, and the difference is not stylistic. The neighbouring resolver in `verify.mjs`
// finds a region's frame with a regex, and every shape it has had to learn since — a quoted key, a
// one-line object, an inline arrow, the kind-first spelling — arrived as a bug where the check
// silently found nothing and reported the region as declaring nothing. A property lookup on the
// object literal cannot have that failure mode: either the file parses and the answer is true or
// false, or it does not parse and this says so.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { paths } from './util.mjs';

/** The `regions: { … }` object literal in the lagoon overrides module, or null. */
function regionsLiteral(sourceFile) {
  for (const decl of sourceFile.getVariableDeclarations()) {
    if (decl.getName() !== 'regions') continue;
    const init = decl.getInitializer();
    const obj = init?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (obj) return obj;
  }
  return null;
}

/**
 * Does the lagoon declare a `page` for this region?
 *
 * Returns `false` when the overrides module is absent or does not parse — the caller is deciding
 * whether to advertise an address, and advertising one that turns out not to exist is the failure
 * worth avoiding. A caller that needs to distinguish "no" from "could not tell" should parse itself.
 */
export function regionDeclaresPage(id) {
  for (const name of ['src/lagoon.tsx', 'src/lagoon.ts']) {
    const file = resolve(paths.lagoonDir, name);
    if (!existsSync(file)) continue;
    try {
      // Created per call and thrown away: this runs once per region in a CLI command, and holding a
      // project open would tie the answer to a cache nothing here invalidates.
      const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
      const sf = project.createSourceFile('lagoon.tsx', readFileSync(file, 'utf8'));
      const regions = regionsLiteral(sf);
      if (!regions) continue;
      for (const prop of regions.getProperties()) {
        const assignment = prop.asKind(SyntaxKind.PropertyAssignment);
        if (!assignment) continue;
        // `'manage-servers'` and `manageServers` are both legal keys; compare the TEXT either way.
        const key = assignment.getName().replace(/^['"`]|['"`]$/g, '');
        if (key !== id) continue;
        const body = assignment.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
        if (!body) return false;
        return body.getProperties().some((p) => {
          const a = p.asKind(SyntaxKind.PropertyAssignment) ?? p.asKind(SyntaxKind.ShorthandPropertyAssignment);
          return a ? a.getName().replace(/^['"`]|['"`]$/g, '') === 'page' : false;
        });
      }
    } catch {
      // A syntax this project's own build accepts and ts-morph does not: answer "no address" rather
      // than crash a command whose job is to list what can be opened.
      return false;
    }
  }
  // THE ARRAY FORM, which is the other half of how a lagoon declares its regions.
  //
  // `regions = [loginRegion, directoryRegion, …]`, each built by `overridesFor(archipelago, {…})` in
  // its own module. There is no region id in that list to match on — the id lives inside the
  // archipelago the call points at — so this reads the PER-REGION MODULE instead, the same
  // `<lagoonDir>/src/regions/<id>` convention the rest of the CLI already maps a changed file by.
  //
  // Missing this cost the address on a real project: the check found the page and reported on it
  // while `motu lagoon states` said the region had none, which is the two-answers-to-one-question
  // shape this file exists to avoid.
  return regionModuleDeclaresPage(id);
}

/** Does `<lagoonDir>/src/regions/<id>.(tsx|ts)` pass a `page` to `overridesFor`? */
function regionModuleDeclaresPage(id) {
  for (const ext of ['.tsx', '.ts']) {
    const file = resolve(paths.lagoonDir, 'src/regions', `${id}${ext}`);
    if (!existsSync(file)) continue;
    try {
      const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
      const sf = project.createSourceFile(`region${ext}`, readFileSync(file, 'utf8'));
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        if (call.getExpression().getText() !== 'overridesFor') continue;
        const spec = call.getArguments()[1]?.asKind(SyntaxKind.ObjectLiteralExpression);
        if (spec?.getProperty('page')) return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * The slots a region declares CONDITIONAL — `when` or `unless` on the root's slot mapping.
 *
 * Two slots can be alternatives: peps' login declares `auth-error` `when: 'authError'` and
 * `login-form` `unless: 'authError'`, and exactly one of them can ever render. A check that demands
 * every declared slot be reached calls a correctly-written region broken, every time, and an error
 * nobody can act on is how a check teaches people to ignore it.
 *
 * PARSED STRUCTURALLY — an object literal carrying BOTH a `slot` and a `when`/`unless` — rather than
 * matched positionally, because these mappings are written in several shapes and a pattern that
 * assumes one of them fails silently on the others.
 */
export function conditionalSlots(file) {
  const out = new Set();
  if (!existsSync(file)) return out;
  try {
    const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
    const sf = project.createSourceFile('archipelago.ts', readFileSync(file, 'utf8'));
    for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
      const prop = (name) => obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment);
      const slot = prop('slot')?.getInitializer()?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
      if (slot && (prop('when') || prop('unless'))) out.add(slot);
    }
  } catch {
    // Unparseable: report nothing as conditional rather than guess. The check then warns where it
    // would have stayed quiet, which is the safe direction for a warning.
  }
  return out;
}

/** The lagoon overrides module, parsed once, or null. */
function overridesSource(project) {
  for (const name of ['src/lagoon.tsx', 'src/lagoon.ts']) {
    const file = resolve(paths.lagoonDir, name);
    if (!existsSync(file)) continue;
    try {
      return { file, sf: project.createSourceFile(name.endsWith('x') ? 'l.tsx' : 'l.ts', readFileSync(file, 'utf8')) };
    } catch {
      return null;
    }
  }
  return null;
}

/** A property's name with any quoting removed — `'manage-servers'` and `manageServers` both answer plainly. */
function keyOf(prop) {
  const a = prop.asKind(SyntaxKind.PropertyAssignment) ?? prop.asKind(SyntaxKind.ShorthandPropertyAssignment);
  return a ? a.getName().replace(/^['"`]|['"`]$/g, '') : null;
}

/** Resolve a local identifier to the module file it is imported from. */
function moduleOfIdent(sf, fromFile, ident) {
  for (const imp of sf.getImportDeclarations()) {
    const named = imp.getNamedImports().some((n) => (n.getAliasNode() ?? n.getNameNode()).getText() === ident);
    const dflt = imp.getDefaultImport()?.getText() === ident;
    if (!named && !dflt) continue;
    const base = resolve(dirname(fromFile), imp.getModuleSpecifierValue().replace(/\.js$/, ''));
    return ['.tsx', '.ts', '/index.tsx', '/index.ts', ''].map((e) => base + e).find((c) => existsSync(c)) ?? null;
  }
  return null;
}

/** The `export const <name> = …` initializer, whatever its type annotation. */
function exportedInitializer(sf, name) {
  return sf.getVariableDeclaration(name)?.getInitializer() ?? null;
}

/**
 * WHERE A REGION'S FRAME LIVES — the module holding its `layout`, and whether one was declared at all.
 *
 * PARSED, after years of not being. The regex this replaces had learned six shapes the hard way, each
 * arriving as a SILENT MISS that reported a correctly-declared region as declaring nothing: a quoted
 * key, a one-line `export const regions = [a, b];`, an entry that is an object rather than an
 * identifier, an inline arrow, a `.js` specifier, the array form. Two cold-start agents lost their
 * longest debugging stretch to the third of those, and found the cause only by reading motu's source.
 *
 * Every one of those shapes is a normal way to write the file, and none of them is visible to a
 * pattern that matches text. They are all the same two nodes to a parser.
 *
 * Returns the same four-field answer the regex did:
 *   `{ module, declared, exportName?, inline? }`
 * — `declared` says the region has an entry, `module` is the file to open (null when there is nothing
 * to open), and `inline` marks a layout written in place, which is declared but not inspectable.
 */
export function frameModuleFor(id) {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const found = overridesSource(project);
  if (!found) return { module: null, declared: false };
  const { file, sf } = found;
  const moduleOf = (ident) => moduleOfIdent(sf, file, ident);

  // KIND-FIRST: `export const layout = { <id>: X }` — the older spelling, still honoured. The value
  // IS the layout, so anything that is not an identifier is an inline one rather than a missing one.
  const layoutMap = exportedInitializer(sf, 'layout')?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (layoutMap) {
    for (const prop of layoutMap.getProperties()) {
      if (keyOf(prop) !== id) continue;
      const init = prop.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
      const ident = init?.asKind(SyntaxKind.Identifier)?.getText();
      if (ident) return { module: moduleOf(ident), declared: true, exportName: ident };
      return { module: null, declared: true, inline: true };
    }
  }

  const regions = exportedInitializer(sf, 'regions');

  // RECORD: `export const regions = { <id>: X }` or `{ <id>: { layout: X, … } }`.
  const asRecord = regions?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (asRecord) {
    for (const prop of asRecord.getProperties()) {
      if (keyOf(prop) !== id) continue;
      const init = prop.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
      const ident = init?.asKind(SyntaxKind.Identifier)?.getText();
      if (ident) return { module: moduleOf(ident), declared: true, exportName: ident };
      const entry = init?.asKind(SyntaxKind.ObjectLiteralExpression);
      const layout = entry?.getProperty('layout')?.asKind(SyntaxKind.PropertyAssignment);
      if (!layout) return { module: null, declared: true };
      const li = layout.getInitializer()?.asKind(SyntaxKind.Identifier)?.getText();
      if (li) return { module: moduleOf(li), declared: true, exportName: li };
      return { module: null, declared: true, inline: true };
    }
  }

  // ARRAY: `export const regions = [loginRegion, …]`, each built by `overridesFor(<x>Archipelago, …)`
  // in its own module. The identifier alone cannot say which region it is — two regions' camel-case
  // can collide — so the archipelago it points at has to name this id.
  const asArray = regions?.asKind(SyntaxKind.ArrayLiteralExpression);
  if (asArray) {
    let sawSomeModule = false;
    for (const el of asArray.getElements()) {
      const ident = el.asKind(SyntaxKind.Identifier)?.getText();
      const module = ident ? moduleOf(ident) : null;
      if (!module) continue;
      try {
        const body = project.createSourceFile(`r${sawSomeModule}${ident}.tsx`, readFileSync(module, 'utf8'));
        const call = body
          .getDescendantsOfKind(SyntaxKind.CallExpression)
          .find((c) => c.getExpression().getText() === 'overridesFor');
        const bound = call?.getArguments()[0]?.asKind(SyntaxKind.Identifier)?.getText();
        if (!bound) continue;
        sawSomeModule = true;
        const from = body
          .getImportDeclarations()
          .find((i) => i.getNamedImports().some((n) => (n.getAliasNode() ?? n.getNameNode()).getText() === bound))
          ?.getModuleSpecifierValue();
        if (!from || !new RegExp(`(^|/)${id}\\.archipelago(\\.[jt]sx?)?$`).test(from)) continue;
        return { module, declared: true };
      } catch {
        continue;
      }
    }
    // The array exists and nothing in it could be read: unresolvable, so loud rather than quiet.
    if (!sawSomeModule) return { module: null, declared: true };
  }
  return { module: null, declared: false };
}

/**
 * The slots an archipelago declares INSIDE its islands — nested composition.
 *
 * motu fills these into the outer island's props, in the page and in the lagoon alike, so a frame
 * that never names them is composing them all the same and must not be reported for omitting them.
 *
 * THE REGEX THIS REPLACES DEPENDED ON INDENTATION. It removed the root's own mapping with
 * `/^ {2}slots\s*:[\s\S]*?^ {2}\},/m` — two literal spaces — and then matched what was left. Change
 * the formatter's `tabWidth`, use tabs, or nest the config one level deeper and it silently matches
 * nothing: no error, just a region that appears to declare no nested slots and a frame reported for
 * not composing them. It worked because every project so far happens to indent by two.
 *
 * Structurally there is no ambiguity: nested slots are the `slots` of an ISLAND ENTRY, the root's are
 * the `slots` of the config. A parser can tell those apart; a pattern over text cannot.
 */
export function nestedSlots(file) {
  const out = new Set();
  if (!existsSync(file)) return out;
  try {
    const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
    const sf = project.createSourceFile('archipelago.ts', readFileSync(file, 'utf8'));
    // The config is whichever object literal declares `islands: [...]` — it may sit inside a call
    // (`archipelago<…>()({…}, {…})`), so it is found by SHAPE rather than by position.
    const config = sf
      .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
      .find((o) => o.getProperty('islands')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression));
    const islands = config?.getProperty('islands')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression);
    for (const entry of islands?.getElements() ?? []) {
      const slots = entry
        .asKind(SyntaxKind.ObjectLiteralExpression)
        ?.getProperty('slots')
        ?.asKind(SyntaxKind.PropertyAssignment)
        ?.getInitializer()
        ?.asKind(SyntaxKind.ObjectLiteralExpression);
      for (const prop of slots?.getProperties() ?? []) {
        const init = prop.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
        // `prop: 'slot-name'` and `prop: { slot: 'slot-name', … }` are both legal spellings.
        const direct = init?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
        const viaSlot = init
          ?.asKind(SyntaxKind.ObjectLiteralExpression)
          ?.getProperty('slot')
          ?.asKind(SyntaxKind.PropertyAssignment)
          ?.getInitializer()
          ?.asKind(SyntaxKind.StringLiteral)
          ?.getLiteralValue();
        if (direct || viaSlot) out.add(direct ?? viaSlot);
      }
    }
  } catch {
    // Unparseable: report no nested slots, which is what the regex did on a shape it could not read —
    // except this one cannot be defeated by whitespace.
  }
  return out;
}
