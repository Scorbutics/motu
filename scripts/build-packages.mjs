// Build the publishable packages.
//
// WHY THIS EXISTS AT ALL. motu's packages were consumed as raw TypeScript through symlinks into the
// checkout, which made every consumer compile motu's source under its own tsconfig and — the reason
// this got written — put motu's files OUTSIDE the consumer's tree. Node resolution walks up from a
// module's real path, so `import 'react'` inside `packages/react/src` never reached the host's copy;
// it found whatever sat next to motu, or nothing. A package installed into the host's node_modules
// walks up into the HOST's tree, so `react` resolves to the host's own copy and the peerDependency
// works the way it was always declared. That is the whole point of building this.
//
// TWO CONVENTIONS MEET HERE, and they disagree about file extensions:
//   source  — extensionless relative imports, because a BUNDLER resolves them and Turbopack cannot
//             map '.js' to '.ts' (see 19ce988).
//   output  — explicit '.js', because NODE resolves these and ESM has no extension search.
// So the emit is rewritten below. It is not a workaround for either side; each is right about its own
// consumer, and this is the seam between them.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Dependency order. A package's `types` points at its own dist, so a dependent cannot typecheck
// until its dependencies have emitted their declarations.
const COMPILED = [
  'packages/types',
  'packages/core',
  'packages/runtime',
  'packages/react',
  'packages/debug-overlay',
  'packages/adapters/angularjs',
  'packages/adapters/next',
];

// Already JavaScript with hand-written declarations; there is nothing to compile, and running tsc
// over them would only produce a worse copy of what is already there.
const AS_IS = ['packages/chrome', 'packages/cli', 'packages/host'];

/** Add the '.js' that Node's ESM resolver requires and the source deliberately omits. */
function addExtensions(dir) {
  let touched = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) { touched += addExtensions(p); continue; }
    if (!/\.(js|d\.ts)$/.test(entry.name)) continue;
    const src = readFileSync(p, 'utf8');
    const out = src.replace(
      /((?:from|import\(|export\s+\*\s+from)\s*['"])(\.\.?\/[^'"]*?)(['"])/g,
      (m, head, spec, tail) => {
        if (/\.(js|mjs|cjs|json|css)$/.test(spec)) return m;
        // A directory import means its index; Node will not find that on its own either.
        const asDir = resolve(dirname(p), spec);
        const target = existsSync(asDir) && statSync(asDir).isDirectory() ? `${spec}/index.js` : `${spec}.js`;
        touched++;
        return head + target + tail;
      },
    );
    if (out !== src) writeFileSync(p, out);
  }
  return touched;
}

function build(pkgDir) {
  const abs = resolve(ROOT, pkgDir);
  const name = JSON.parse(readFileSync(join(abs, 'package.json'), 'utf8')).name;
  rmSync(join(abs, 'dist'), { recursive: true, force: true });

  // Written here rather than committed as seven near-identical files. It is derived from the package
  // layout, so a package that changes shape does not also need someone to remember this.
  const cfg = join(abs, 'tsconfig.build.json');
  writeFileSync(cfg, JSON.stringify({
    extends: relative(abs, join(ROOT, 'tsconfig.base.json')).split('\\').join('/'),
    compilerOptions: {
      rootDir: 'src',
      outDir: 'dist',
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      composite: false,
      incremental: false,
      noEmit: false,
      types: [],
    },
    include: ['src/**/*'],
  }, null, 2));

  try {
    execFileSync('node', [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', cfg], {
      cwd: abs, stdio: 'pipe', encoding: 'utf8',
    });
  } catch (err) {
    process.stdout.write(err.stdout || '');
    throw new Error(`${name}: tsc failed`);
  } finally {
    rmSync(cfg, { force: true });
  }

  const fixed = addExtensions(join(abs, 'dist'));
  const files = readdirSync(join(abs, 'dist'), { recursive: true }).filter((f) => String(f).endsWith('.js')).length;
  console.log(`  ✓ ${name.padEnd(26)} ${String(files).padStart(3)} js, ${String(fixed).padStart(3)} specifiers extended`);
}

console.log('building publishable packages');
for (const p of COMPILED) build(p);
for (const p of AS_IS) {
  const name = JSON.parse(readFileSync(resolve(ROOT, p, 'package.json'), 'utf8')).name;
  console.log(`  – ${name.padEnd(26)} ships as authored (already JavaScript)`);
}
