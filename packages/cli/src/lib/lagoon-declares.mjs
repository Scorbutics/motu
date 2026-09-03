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
import { resolve } from 'node:path';
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
  return false;
}
