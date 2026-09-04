// `sources` from an archipelago, read ONCE and by a parser.
//
// WHY THIS FILE EXISTS. Two commands read the same declaration, and each had grown its own regex over
// it: `verify` handled both forms, `integrate check` handled only `{ module, produces }` and silently
// skipped `week: weekSource`. So moving a region to the STRONGER declaration — the source imported by
// reference, which the type system checks — quietly turned off the check that says the page installs
// it. The better declaration got less checking, and nothing said so.
//
// That is what two hand-rolled readers of one shape always end up doing. `integration.mjs` had
// already reached this conclusion for the host's JSX ("PARSED, NOT MATCHED … ts-morph is already how
// every other host-source question here is answered; this was the last regex standing in the middle
// of it") — it was not the last: the archipelago side was still matched, in both files.
//
// The scars are worth keeping in view. `verify.mjs` blanks comments before matching, because an
// apostrophe in prose opens a string as far as a regex is concerned and "the week's missions" turned
// into a key named ` missions, so it comes...`. `\n  \},` as a block terminator means the declaration
// must be indented exactly two spaces. Neither is a property of the language; both are properties of
// reading it with the wrong tool.
import { SyntaxKind } from 'ts-morph';
import { sourceFileAt } from './ts-project.mjs';

/** Strip the quotes ts-morph keeps on a string literal's text. */
const unquoted = (node) => (node?.getText?.() ?? '').replace(/^['"`]|['"`]$/g, '');

/**
 * Where an identifier came from — the import that brought it in.
 *
 * A source declared by reference names its module exactly once, in the import, which is the fact the
 * regex was reconstructing with a RegExp built from the identifier's own name.
 */
function moduleOfIdentifier(sourceFile, name) {
  for (const decl of sourceFile.getImportDeclarations()) {
    const named = decl.getNamedImports().some((i) => (i.getAliasNode() ?? i.getNameNode()).getText() === name);
    const dflt = decl.getDefaultImport()?.getText() === name;
    if (named || dflt) return decl.getModuleSpecifierValue();
  }
  return null;
}

/**
 * Every declared source of one archipelago file.
 *
 * Returns `{ [name]: { module, produces, byReference, reachesText } }` — both declaration forms, in
 * one shape, so a caller cannot handle one and forget the other. `reachesText` is the raw initializer
 * of `reaches` (or null), because its entries are a mix of strings and objects that each caller
 * already knows how to read.
 *
 * An unparseable file yields `{}` rather than throwing: this answers "what does the region declare",
 * and a file the host's own build accepts but ts-morph does not is not a question about sources.
 */
export function declaredSourcesOf(archipelagoFile) {
  let sf;
  try {
    sf = sourceFileAt(archipelagoFile, { allowJs: true });
  } catch {
    return {};
  }

  // The `sources:` property of the archipelago's config object. Found by NAME rather than by walking
  // the call expression, because the config is written as `archipelago<…>()({ … } as const, { … })`
  // and the shape of that wrapper is not this function's business.
  const prop = sf
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .find((p) => (p.getNameNode?.()?.getText?.() ?? '').replace(/['"]/g, '') === 'sources');
  const obj = prop?.getInitializerIfKind?.(SyntaxKind.ObjectLiteralExpression);
  if (!obj) return {};

  const out = {};
  for (const entry of obj.getProperties()) {
    if (!entry.getNameNode) continue;
    const name = (entry.getNameNode().getText() ?? '').replace(/['"]/g, '');
    const init = entry.getInitializer?.();
    if (!init) continue;

    // `week: weekSource` — the source object itself. What it produces lives in the source file and is
    // checked by the compiler there, so there is nothing to read here but the module.
    if (init.getKind() === SyntaxKind.Identifier) {
      const module = moduleOfIdentifier(sf, init.getText());
      if (module) out[name] = { module, produces: [], byReference: true, reachesText: null };
      continue;
    }

    // `revenue: { module: '…', produces: [...] }` — a claim about somebody else's code.
    if (init.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const moduleProp = init.getProperty?.('module');
      const module = unquoted(moduleProp?.getInitializer?.());
      if (!module) continue;
      const producesInit = init.getProperty?.('produces')?.getInitializer?.();
      const produces = (producesInit?.getElements?.() ?? []).map((el) => unquoted(el));
      const reaches = init.getProperty?.('reaches')?.getInitializer?.();
      out[name] = {
        module,
        produces,
        byReference: false,
        // The INNER text of the array, which is what the existing effect readers take.
        reachesText: reaches?.getText?.()?.replace(/^\[|\]$/g, '') ?? null,
      };
    }
  }
  return out;
}
