// Adapter-owned verify layer for Next.js islands. Core `motu island verify` runs the framework-neutral
// static/config/runtime checks; it cannot judge the one coupling unique to this host — the RSC
// boundary.
//
// Why this is the Next analogue of the AngularJS adapter's host-scope check: both police the ONE way an
// island can silently bind itself to its host. On AngularJS that is reaching up the scope chain. On
// Next it is reaching across the server/client split. An island that imports `next/headers`, or awaits
// a server action, or omits 'use client', is a component only Next can render — and the lagoon is a
// plain Vite SPA with no Next runtime at all. It would pass every static check and then fail to mount,
// or worse, mount only in the host and never in the loop. The loop is the product; this keeps islands
// inside it.
//
// Operates on the source text + the structured coupling the CLI extracts from element.ts via AST (no
// ts-morph dependency here — the CLI owns parsing, the adapter owns semantics). Discovery is by package
// export (`@motu/adapter-next/verify`), resolved from the adapter the island actually imports.

/** Modules that only exist on the server. Importing one makes the component unmountable in the lagoon. */
const SERVER_ONLY = [
  'server-only',
  'next/headers',
  'next/server',
  'next/cache',
  'next/og',
];

/** Next modules an island may use — the lagoon stubs exactly these (see the scaffolded next-stubs). */
const STUBBED = ['next/link', 'next/image', 'next/navigation'];

/**
 * @param {{ source?: string, coupling?: { serverActions?: boolean } }} input
 *   source   — the ui component's source text (the CLI reads the file; the adapter judges it)
 *   coupling — structured `contract.coupling` from element.ts
 * @returns {{ level: 'error'|'warn'|'ok', check: string, msg: string }[]}
 */
export function checkCoupling({ source, coupling, graph } = {}) {
  const findings = [];
  if (typeof source !== 'string') return findings;

  // Strip comments so a rule is not tripped by prose ABOUT the rule (this file would fail itself).
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // Type-only imports are erased at build, so they cannot drag server code into a client bundle —
  // and importing the SERVER'S service-map type is exactly how a typed contract is declared. Judging
  // them as runtime imports would make the correct pattern unusable.
  const runtimeCode = code.replace(/^\s*import\s+type\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, '');
  const imports = [...runtimeCode.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

  // 1. Server-only imports — the island could never mount in the lagoon.
  const serverImports = imports.filter((s) => SERVER_ONLY.some((m) => s === m || s.startsWith(m + '/')));
  if (serverImports.length) {
    for (const s of serverImports) {
      findings.push({
        level: 'error',
        check: 'rsc-boundary',
        msg: `imports server-only '${s}' — an island must mount in the lagoon, which has no Next runtime`,
      });
    }
  } else {
    // THE SAME QUESTION, ASKED OF THE WHOLE BUNDLE. The island's own file was never where this
    // boundary lived: a Next app puts `'use server'` in an actions module and `server-only` in the
    // lib beneath it, so an island four ordinary hops away from either still cannot be bundled for a
    // Vite lagoon. Reported with the CHAIN, because "this island cannot mount" is useless without
    // the hop that made it true — the failure it replaces was an unattributable rollup error.
    const reached = [];
    for (const node of graph ?? []) {
      if (node.truncated) {
        findings.push({
          level: 'warn',
          check: 'rsc-boundary',
          msg: "the island's import graph was larger than this check walks, so the part beyond the cap is unexamined",
        });
        continue;
      }
      const hop = String(node.source ?? '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s*import\s+type\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, '');
      const bad = [...hop.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
        .map((m) => m[1])
        .filter((s) => SERVER_ONLY.some((m) => s === m || s.startsWith(m + '/')));
      const action = /^\s*['"]use server['"]/m.test(hop);
      if (bad.length || action) reached.push({ file: node.file, why: bad.length ? `imports server-only '${bad[0]}'` : "is a 'use server' module" });
    }
    if (reached.length) {
      for (const r of reached.slice(0, 3)) {
        findings.push({
          level: 'error',
          check: 'rsc-boundary',
          msg: `reaches ${r.file}, which ${r.why} — the island itself is clean, but everything it imports is in the same bundle, and the lagoon has no Next runtime to strip it`,
        });
      }
      if (reached.length > 3) {
        findings.push({ level: 'error', check: 'rsc-boundary', msg: `…and ${reached.length - 3} more module(s) in this island's import graph` });
      }
    } else {
      findings.push({
        level: 'ok',
        check: 'rsc-boundary',
        msg: `no server-only imports${graph?.length ? ` (island + ${graph.length} reachable module(s))` : ''}`,
      });
    }
  }

  // 2. 'use client'. An island always REACHES the browser — it mounts inside a custom element, which
  //    only ever runs client-side — so the directive is not what makes it work today. It is what keeps
  //    it working on the way out: motu's exit path is dropping the wrapper and importing the ui
  //    component directly, and at that moment a hook-using component with no directive breaks the
  //    first server page that renders it. So: an error once the component actually uses hooks (the
  //    break is real and mechanical), a warning otherwise (a pure projection is safe either way).
  const hasUseClient = /^\s*['"]use client['"]/.test(code);
  const usesHooks = /\buse(State|Effect|Reducer|Ref|Callback|Memo|Context|LayoutEffect|Transition|Optimistic)\s*\(/.test(code);
  if (hasUseClient) {
    findings.push({ level: 'ok', check: 'use-client', msg: "declares 'use client'" });
  } else if (usesHooks) {
    findings.push({
      level: 'error',
      check: 'use-client',
      msg: "uses hooks without 'use client' — mounts fine as an island, but breaks the moment the component is imported directly (the exit path)",
    });
  } else {
    findings.push({
      level: 'warn',
      check: 'use-client',
      msg: "no 'use client' — safe while it stays a pure projection; add it before the component grows state",
    });
  }

  // 3. Server actions. A 'use server' function is an RPC the lagoon cannot serve; server I/O belongs
  //    on the contract seam, which MockTransport can stand in for.
  if (/['"]use server['"]/.test(code)) {
    findings.push({
      level: 'error',
      check: 'rsc-boundary',
      msg: "contains a 'use server' action — server I/O goes through the contract seam, not an RPC the lagoon cannot replay",
    });
  } else if (coupling?.serverActions) {
    findings.push({
      level: 'warn',
      check: 'rsc-boundary',
      msg: 'declares serverActions coupling — the lagoon cannot replay these; prefer the contract seam',
    });
  }

  // 4. Stubbed Next modules, REPORTED ON THE OK LINE rather than as their own standing warning.
  //
  // `next-stubs` used to be a warning of its own, fired whenever the island imported one of these —
  // legitimate imports, with no state in which the warning could be cleared except not using them.
  // The information is worth having (what the lagoon renders for them is inert, so an island leaning
  // on their real behaviour passes here and is still wrong in the host); the unclearable warning was
  // not, because a warning nobody can action is how a project learns to skim past the real ones.
  const stubbed = imports.filter((s) => STUBBED.includes(s));
  if (stubbed.length) {
    findings.push({
      level: 'ok',
      check: 'rsc-boundary',
      msg: `uses ${stubbed.join(', ')} — INERT in the lagoon (navigation is a host intent), so this passes here and can still be wrong in the host`,
    });
  }

  return findings;
}
