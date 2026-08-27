// Installs process.env before any host module reads it. MUST be imported first — see below.
import config from '{{lagoonConfigImport}}';

const g = globalThis as unknown as { process?: { env: Record<string, string> } };
g.process = g.process ?? { env: {} };
// Declared under "env" in lagoon.config.json. The lagoon has no backend, so these only have to EXIST;
// never put a real secret here — a published lagoon is a static page anyone with the link can read.
Object.assign(g.process.env, { NODE_ENV: 'development', ...(config.env ?? {}) });
