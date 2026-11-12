// Which command answers for which tool, on the shlink target, and how its answer is reduced to a
// signature that two runs of the same tree reproduce exactly.
//
// FAMILIES are what the headline scores: a harness refuses a lie when any of its instruments changed.
// `shared` (the app's own tsc) is credited to whichever harness's evidence the cheat edited. `context`
// (the app's own test suite) is reported for the page-drift cheat and credited to nobody — it is the
// project's, not either harness's.
const MOTU = '/mnt/dev/motu/packages/cli/src/cli.mjs';

/**
 * Every WARNING and ERROR motu reported, from `--json`, as `level:scope:check` — the message is left out
 * because it carries counts and timings. Read from the JSON rather than the terminal because `motu
 * check` summarises warnings it has seen before ("6 warning(s) · all unchanged") instead of listing
 * them, and the first run of this bench read that summary as "nothing new" on every cheat.
 */
const motuFindings = (r) => {
  const text = r.out.slice(r.out.indexOf('{'), r.out.lastIndexOf('}') + 1);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [`unparseable:exit${r.code}`];
  }
  const out = new Set();
  const walk = (node, scope) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, scope));
    if (!node || typeof node !== 'object') return;
    const here = node.name ?? node.id ?? node.tag ?? scope;
    if (typeof node.level === 'string' && typeof node.check === 'string' && /^(error|warn|inconclusive)$/.test(node.level)) {
      out.add(`${node.level}:${scope ?? '-'}:${node.check}`);
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'msg') walk(v, typeof here === 'string' ? here : scope);
  };
  walk(json, null);
  return [...out].sort();
};
const motuSign = (r) => motuFindings(r).join(',');
/** A new ERROR (or a failing exit) refuses the lie; a new WARNING only flags it — exit 0, nothing stops. */
const motuGrade = (now, base) => {
  const before = new Set(base.sign.split(',').filter(Boolean));
  const added = now.sign.split(',').filter((f) => f && !before.has(f));
  if (now.code === 1 && base.code !== 1) return 'refused';
  if (added.some((f) => f.startsWith('error:'))) return 'refused';
  return added.length ? 'flagged' : now.sign !== base.sign ? 'flagged' : false;
};

/** The names of failing stories / tests, timing removed. */
const vitestSign = (r) =>
  [...new Set((r.out.match(/(?:FAIL|×|✗)\s+.*$/gm) ?? []).map((l) => l.replace(/\d+(\.\d+)?\s*m?s/g, '').trim()))].sort().join(' | ') +
  (r.code !== 0 && !/(FAIL|×|✗)/.test(r.out) ? `exit:${r.code}` : '');

export const instruments = ({ run }) => [
  {
    id: 'tsc',
    family: 'shared',
    go: () => run('npx', ['tsc', '--noEmit'], 300_000),
    sign: (r) => [...new Set(r.out.match(/error TS\d+/g) ?? [])].sort().join(','),
  },
  {
    id: 'motu-static',
    family: 'motu',
    go: () => run('node', [MOTU, 'check', '--json'], 300_000),
    sign: motuSign,
    grade: motuGrade,
    inconclusiveExit: 2,
  },
  {
    id: 'motu-runtime',
    family: 'motu',
    go: () => run('node', [MOTU, 'check', '--runtime', '--json'], 600_000),
    sign: motuSign,
    grade: motuGrade,
    inconclusiveExit: 2,
  },
  {
    id: 'motu-integrate',
    family: 'motu',
    go: () => run('node', [MOTU, 'integrate', 'check', '--json'], 120_000),
    sign: motuSign,
    grade: motuGrade,
    inconclusiveExit: 2,
  },
  {
    id: 'sb-default',
    family: 'storybook-default',
    go: () => run('npm', ['run', 'test-storybook'], 400_000),
    sign: vitestSign,
  },
  {
    id: 'sb-strict',
    family: 'storybook-strict',
    go: () => run('npm', ['run', 'test-storybook'], 400_000, { VITE_BENCH_SB_STRICT: '1' }),
    sign: vitestSign,
  },
  {
    id: 'app-tests',
    family: 'context',
    // The app's own suite, without the stories the Storybook init folded into the default run.
    go: () => run('npx', ['vitest', 'run', '--run', '--project=!storybook'], 600_000),
    sign: vitestSign,
  },
];
