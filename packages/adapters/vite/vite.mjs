// The generic Vite host's contribution to the lagoon's Vite config.
//
// Every other adapter here RESTATES its framework: the Next one knows about `next/*` stubs, the app's
// `@/…` alias and Tailwind, because a Next project's build is conventional enough to describe once.
// A Vite application is not conventional — it IS its vite.config.ts — and any list motu wrote of what
// such a project might need (linaria? lingui? svgr? a tsconfig-paths plugin? which aliases?) would be
// a restatement that drifts the day the app adds a plugin.
//
// So this adapter states nothing. It LOADS the host's own config with Vite's own loader and borrows
// two things from it: the plugins that transform the host's source, and the aliases that resolve it.
// Same principle as the transport seam — consume the application's artifact rather than reproduce it —
// and the reason it is worth the file is that it is what lets the lagoon render the host's REAL
// components instead of stand-ins.
//
// Two classes of plugin are dropped, both because the lagoon is a different application than the one
// the config was written for:
//   - BUILD REPORTERS (visualizer, bundle-size guards) assert on an output the lagoon does not produce
//   - the host's REACT plugin is kept, and motu's is then skipped: two React transforms in one
//     pipeline is a duplicated JSX runtime, which surfaces as hooks failing in ways nothing explains
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/** Reporters and size guards: they describe a build the lagoon is not doing. */
const DROP = /visualizer|bundle|size-?limit|checker|legacy/i;
/** A React transform, whatever the flavour (plugin-react, plugin-react-swc, plugin-react-oxc). */
const IS_REACT = /^vite:react|react-swc|react-oxc|react-babel|react-refresh/i;

export async function contribute({ paths, lagoonJson }) {
  const configFile = lagoonJson.hostViteConfig
    ? resolve(paths.hostRoot, lagoonJson.hostViteConfig)
    : ['vite.config.ts', 'vite.config.js', 'vite.config.mts'].map((f) => resolve(paths.hostRoot, f)).find(existsSync);

  if (!configFile || !existsSync(configFile)) {
    // Not an error: a Vite host with no config is a Vite host with nothing to borrow.
    return {};
  }

  const vite = await import('vite');
  // `serve`, not `build` — a config often branches on the command, and what the lagoon runs is a dev
  // server. The host's `mode` env (loadEnv) is read by the config itself; nothing here supplies one.
  const loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'development' }, configFile, paths.hostRoot);
  if (!loaded?.config) return {};

  const hostPlugins = (loaded.config.plugins ?? []).flat(Infinity).filter(Boolean);
  const named = hostPlugins.filter((p) => typeof p?.name === 'string');
  const plugins = named.filter((p) => !DROP.test(p.name));
  const hasReact = plugins.some((p) => IS_REACT.test(p.name));

  // The host's aliases, ABSOLUTE against the host root. A config that wrote them relative meant them
  // relative to itself, and the lagoon's root is elsewhere.
  const alias = (loaded.config.resolve?.alias ?? []).map((a) =>
    typeof a?.replacement === 'string' && !a.replacement.startsWith('/') && /^[./]/.test(a.replacement)
      ? { ...a, replacement: resolve(paths.hostRoot, a.replacement) }
      : a,
  );

  return {
    plugins,
    // Told to the lagoon builder, which owns the decision to add its own React plugin or not.
    ownsReactTransform: hasReact,
    alias,
    // `tsconfigPaths: true` is a Vite 6+ resolve option; pass it through when the host uses it, since
    // that is often the ONLY thing mapping the app's `@/…` imports.
    ...(loaded.config.resolve?.tsconfigPaths ? { resolveExtra: { tsconfigPaths: true } } : {}),
  };
}
