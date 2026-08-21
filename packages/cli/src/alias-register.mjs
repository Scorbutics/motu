// `--import` RUNS a module; it does not install resolver hooks. Only `module.register` does, and
// forgetting that is silent: the hook file loads, exports `resolve`, and node never calls it.
import { register } from 'node:module';
register('./alias-loader.mjs', import.meta.url);
