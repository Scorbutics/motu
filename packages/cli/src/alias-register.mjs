// `--import` RUNS a module; it does not install resolver hooks. Only `module.register` does, and
// forgetting that is silent: the hook file loads, exports `resolve`, and node never calls it.
//
// Both module systems need teaching, and only one of them is served by a hook. An island's `import`
// goes through the ESM resolver; a `require` deeper in the graph does not, and peps died on exactly
// that — past `@/app` through the hook, then `Cannot find module '@/lib/utils'` from CJS.
import { createRequire, register } from 'node:module';
import { ASSET, ASSET_STUB_CJS, aliasEntries, mapSpecifier } from './lib/alias-core.mjs';

register('./alias-loader.mjs', import.meta.url);

const require = createRequire(import.meta.url);
const Module = require('node:module');
const entries = aliasEntries();
const original = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (ASSET.test(request)) return ASSET_STUB_CJS;
  const mapped = mapSpecifier(request, entries);
  if (mapped) {
    try {
      return original.call(this, mapped, ...rest);
    } catch {
      // fall through to the original request, so a bad alias reports the real name
    }
  }
  return original.call(this, request, ...rest);
};
