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

/**
 * Plugins the lagoon does not borrow, because they describe a build it is not doing.
 *
 * Reporters and size guards assert on an output that does not exist here. SERVICE-WORKER plugins are
 * the addition, and they are the sharpest case: `vite-plugin-pwa` contributes five plugins, and they
 * do not merely go unused — `dev-sw` adds an `options` hook and `build` a `generateBundle`, which
 * between them build the SERVICE WORKER from `srcDir` resolved into the lagoon's copied root, where
 * nothing is. The whole build dies before anything renders:
 *
 *     [UNRESOLVED_ENTRY] Cannot resolve entry module .motu/cache/lagoon/src/service-worker.ts
 *
 * GUARDING THEM IS NOT ENOUGH, and that was tried first: the guard below drops a plugin whose hook
 * THROWS, and this one does not throw. It succeeds and asks the build for an entry that cannot exist,
 * so the failure lands in rolldown's entry resolution where no plugin hook can catch it.
 *
 * A service worker means nothing in a preview — it is offline caching for a deployed app — so this
 * costs the lagoon nothing and is not a workaround.
 *
 * Measured on shlink (Vite + npm): the lagoon was unbootable, `motu lagoon serve` failed three times
 * identically, and the adopter's fix was to fork the app's Vite config into their own repository —
 * motu-only code in the host, which adopting motu exists to avoid.
 */
const DROP = /visualizer|bundle|size-?limit|checker|legacy|pwa|service-?worker|workbox/i;
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
  const kept = named.filter((p) => !DROP.test(p.name));

  // A HOST PLUGIN THAT CANNOT RUN HERE IS DROPPED BY NAME, NOT ALLOWED TO KILL THE LAGOON.
  //
  // These are ALREADY-INSTANTIATED plugin objects, whose hooks closed over the config they were built
  // for. The lagoon's root and envDir are not the host's, so a plugin whose `config`/`configResolved`
  // hook asserts on them throws — and the throw propagates out of Vite before anything renders.
  // Measured twice, on unrelated plugins: Mastodon's theme plugin
  // (`if (!userConfig.root || !userConfig.envDir) throw new Error('Unknown project directory')`) and
  // shlink's `vite-plugin-pwa` (resolving `srcDir` against the lagoon's copied root). Both times the
  // whole lagoon was unbootable and the adopter's fix was to fork the app's Vite config into their own
  // repository — motu-only code in the host, which adopting motu is supposed to avoid.
  //
  // So each borrowed plugin's config-time hooks are guarded. One that throws is removed and SAID, and
  // the rest of the host's pipeline still transforms the host's real components. A dropped transform
  // may of course mean a component that no longer compiles — which is a legible failure naming the
  // plugin, instead of an assertion from a file the adopter did not write.
  const dropped = [];
  // EVERY HOOK THAT CAN FAIL, AND ASYNCHRONOUSLY. The first version wrapped four CONFIG-TIME hooks
  // with a synchronous try/catch, which missed the case its own comment above names.
  //
  // `vite-plugin-pwa` does not throw while configuring. It succeeds, and then launches its OWN build
  // for the service worker from `closeBundle` — against `srcDir` resolved into the lagoon's copied
  // root, where nothing is:
  //
  //     [UNRESOLVED_ENTRY] Cannot resolve entry module .motu/cache/lagoon/src/service-worker.ts
  //
  // Two reasons the guard could not see it: `closeBundle` was not in the list, and that child build is
  // ASYNC — it rejects a promise rather than throwing, so a synchronous `catch` never runs. Measured
  // on shlink: the lagoon was unbootable, `lagoon serve` failed three times identically, and the
  // adopter forked the app's Vite config into their own repo to get past it — motu-only code in the
  // host, which adopting motu exists to avoid.
  //
  // A build-time hook that fails is dropped for the REST of the run too: a service worker half-built
  // once is not worth attempting again on the next rebuild.
  const HOOKS = [
    'config',
    'configResolved',
    'configureServer',
    'options',
    'buildStart',
    'transformIndexHtml',
    'renderStart',
    'generateBundle',
    'writeBundle',
    'buildEnd',
    'closeBundle',
  ];
  const guard = (plugin) => {
    const wrapped = { ...plugin };
    const record = (hook, err) => {
      if (!dropped.some((d) => d.name === plugin.name)) {
        dropped.push({ name: plugin.name, hook, message: String(err?.message ?? err).split('\n')[0] });
      }
    };
    for (const hook of HOOKS) {
      const original = plugin[hook];
      if (typeof original !== 'function') continue;
      wrapped[hook] = function (...args) {
        // Already failed once in this run: do not call it again.
        if (dropped.some((d) => d.name === plugin.name)) return undefined;
        try {
          const out = original.apply(this, args);
          // A REJECTED PROMISE IS A FAILURE TOO, and it is the one that mattered here.
          return out && typeof out.then === 'function'
            ? out.then(undefined, (err) => {
                record(hook, err);
                return undefined;
              })
            : out;
        } catch (err) {
          record(hook, err);
          return undefined;
        }
      };
    }
    return wrapped;
  };
  const plugins = kept.map(guard);
  // Reported through the returned contribution so the CLI can print it beside its other notices; the
  // array is filled as the hooks run, which is after this function returns.
  const droppedHostPlugins = dropped;
  const hasReact = kept.some((p) => IS_REACT.test(p.name));

  // The host's aliases, ABSOLUTE against the host root. A config that wrote them relative meant them
  // relative to itself, and the lagoon's root is elsewhere.
  //
  // BOTH SHAPES. Vite accepts `resolve.alias` as an array of {find, replacement} OR as a plain object
  // of find -> replacement, and this assumed the array — so a host using the object form (the shape
  // Vite's own docs lead with) died on `.map is not a function` before the lagoon could build. Found
  // by the first greenfield project on a vite host, whose config was written the documented way.
  const declared = loaded.config.resolve?.alias ?? [];
  const entries = Array.isArray(declared)
    ? declared
    : Object.entries(declared).map(([find, replacement]) => ({ find, replacement }));
  const alias = entries.map((a) =>
    typeof a?.replacement === 'string' && !a.replacement.startsWith('/') && /^[./]/.test(a.replacement)
      ? { ...a, replacement: resolve(paths.hostRoot, a.replacement) }
      : a,
  );

  return {
    plugins,
    /** Filled while the host's plugins run: those whose config-time hooks threw in this pipeline. */
    droppedHostPlugins,
    // Told to the lagoon builder, which owns the decision to add its own React plugin or not.
    ownsReactTransform: hasReact,
    alias,
    // `tsconfigPaths: true` is a Vite 6+ resolve option; pass it through when the host uses it, since
    // that is often the ONLY thing mapping the app's `@/…` imports.
    ...(loaded.config.resolve?.tsconfigPaths ? { resolveExtra: { tsconfigPaths: true } } : {}),
  };
}
