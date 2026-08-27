// `motu island integrate <name> --archipelago <id>` — makes an existing island a member of an
// archipelago (deterministic, in-repo). It:
//   1. AST-inserts an IslandSpec ({ slot, element, + stubbed bind/on }) into the target archipelago's
//      `islands` array in <archipelagos>/<id>/<id>.archipelago.ts.
//   2. Injects a <motu-island slot="…"> marker into the archipelago's `layout` when that layout is an
//      inline string; warns (with the exact marker) when the layout is an imported constant.
// The store bindings and event handlers are judgment calls, so they're left as TODO(motu:wiring) for
// the extraction skill / a human. Injecting the marker into the *legacy* page is stack-specific and is
// the extract skill's job, not the CLI's.
import { existsSync } from 'node:fs';
import { Project, QuoteKind, SyntaxKind } from 'ts-morph';
import { paths, names, color, FMT, islandComponentPath } from '../lib/util.mjs';

/** `received-summary` -> `receivedSummary`: a slot is kebab, a component prop is not. */
function camel(kebab) {
  return kebab.split(/[-_]/).map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
}

/** The binding name a page would use for this region — `actions` -> `Actions`. */
function archConstName(id) {
  const c = camel(id);
  return c[0].toUpperCase() + c.slice(1);
}

/** Find the archipelago object literal (`{ id: '<id>', islands: [...] }`) for the given id. */
function findArchipelago(sf, archId) {
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const idProp = obj.getProperty('id')?.asKind(SyntaxKind.PropertyAssignment);
    if (!idProp) continue;
    const idVal = idProp.getInitializer()?.getText().replace(/['"]/g, '');
    if (idVal === archId && obj.getProperty('islands')) return obj;
  }
  return null;
}

export async function integrateCommand(argv) {
  const name = argv._[0];
  const archId = argv.archipelago || argv.a;
  if (!name || !archId) {
    console.error('usage: motu island integrate <name> --archipelago <id> [--slot <slot>]');
    process.exit(2);
  }
  const { pascal, kebab, tag } = names(name);
  const slot = argv.slot || kebab;

  // Follow element.ts to the component the island mounts — it only lives under ui/ when motu wrote
  // it; an island wrapping the app's own component points outside the project.
  if (!existsSync(islandComponentPath(kebab, pascal))) {
    console.error(color.red(`✗ no island component at ${paths.rel(islandComponentPath(kebab, pascal))} — run \`motu island create ${kebab}\` first`));
    process.exit(1);
  }

  const project = new Project({
    manipulationSettings: { quoteKind: QuoteKind.Single, useTrailingCommas: true },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true },
  });
  const archPath = paths.archipelagoFile(archId);
  if (!existsSync(archPath)) {
    console.error(color.red(`✗ no archipelago with id '${archId}' at ${paths.rel(archPath)}`));
    console.error(color.dim(`  create one with: motu archipelago create ${archId}`));
    process.exit(1);
  }
  const sf = project.addSourceFileAtPath(archPath);
  const arch = findArchipelago(sf, archId);
  if (!arch) {
    console.error(color.red(`✗ couldn't locate the '${archId}' archipelago config in ${archId}.archipelago.ts`));
    process.exit(1);
  }

  const islands = arch.getProperty('islands')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!islands) {
    console.error(color.red(`✗ archipelago '${archId}' has no islands array to extend`));
    process.exit(1);
  }

  // Idempotency: bail if this slot or element tag is already a member.
  const exists = islands.getElements().some((e) => {
    const t = e.getText();
    return t.includes(`slot: '${slot}'`) || t.includes(`element: '${tag}'`);
  });
  if (exists) {
    console.log(color.yellow(`! ${tag} (slot '${slot}') is already a member of '${archId}' — nothing to do`));
    process.exit(0);
  }

  islands.addElement(`{
      slot: '${slot}',
      element: '${tag}',
      // TODO(motu:wiring): bind store keys and/or handle the island's events, e.g.
      // bind: { someProp: 'someStoreKey' },
      // on: { 'some-event': (detail, { store }) => store.set('someStoreKey', detail) },
    }`);

  // WHERE THIS ISLAND IS GOING TO BE PLACED, and the answer depends on how the region composes.
  //
  // A region that declares a `root` places its islands BY PROP: the archipelago maps a prop of the
  // application's own component to a slot, and the page passes that prop. Adding a member without
  // both halves leaves an island that is declared and never placed — `integrate check` says so, but
  // only later, and the command that created the situation is the one that should say it now.
  //
  // The slot is ADDED to `slots` here (it is derivable — one line, keyed by the slot's own name), and
  // what cannot be derived is said out loud: the root component needs a prop, and the page needs to
  // pass it.
  let placementNote;
  const rootProp = arch.getProperty('root')?.asKind(SyntaxKind.PropertyAssignment);
  if (rootProp) {
    const rootName = rootProp.getInitializer()?.getText() ?? 'the root';
    const propName = camel(slot);
    const slotsProp = arch.getProperty('slots')?.asKind(SyntaxKind.PropertyAssignment);
    const slotsObj = slotsProp?.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (slotsObj) {
      if (!slotsObj.getProperty(propName)) slotsObj.addPropertyAssignment({ name: propName, initializer: `'${slot}'` });
      placementNote =
        color.green(`✓ mapped ${propName} -> '${slot}' in \`slots\``) +
        color.dim(`\n    now give ${rootName} a \`${propName}\` prop, and pass it from the page:`) +
        color.dim(`\n      <${archConstName(archId)}.Root ${propName}={<YourComponent … />} … />`);
    } else {
      placementNote =
        color.yellow(`! '${archId}' declares a root but no \`slots\` map`) +
        color.dim(`\n    add:  slots: { ${propName}: '${slot}' }   then give ${rootName} a \`${propName}\` prop`);
    }
  }

  // Layout marker: inject when the layout is an inline string; otherwise tell the user where to add it.
  let layoutNote;
  const layoutProp = arch.getProperty('layout')?.asKind(SyntaxKind.PropertyAssignment);
  const marker = `<motu-island slot="${slot}" theme="motu" fit="native"></motu-island>`;
  if (rootProp) {
    // A root region has no `layout` template and needs none: the arrangement is the app's component.
    layoutNote = null;
  } else if (layoutProp) {
    const init = layoutProp.getInitializer();
    const kind = init?.getKind();
    if (kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      const raw = init.getLiteralText();
      init.setLiteralValue(`${raw}\n  ${marker}`);
      layoutNote = color.green(`✓ added <motu-island slot="${slot}"> to the inline layout`);
    } else {
      layoutNote =
        color.yellow('! layout is an imported constant') +
        color.dim(` — add this marker to it manually:\n    ${marker}`);
    }
  } else {
    layoutNote =
      color.yellow(`! archipelago '${archId}' has no layout`) +
      color.dim(` — add a layout with:\n    ${marker}`);
  }

  sf.formatText(FMT);
  await sf.save();

  console.log(color.green(`✓ integrated ${color.bold(tag)} into archipelago ${color.bold(archId)} (slot '${slot}')`));
  console.log('  ' + color.dim(`${paths.rel(archPath)}   (islands[] + IslandSpec)`));
  if (placementNote) console.log('  ' + placementNote);
  if (layoutNote) console.log('  ' + layoutNote);
  console.log('');
  console.log('Next: fill the TODO(motu:wiring) bindings/handlers, then ' + color.bold(`motu island verify ${kebab}`));
}
