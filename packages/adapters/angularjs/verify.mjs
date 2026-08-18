// Adapter-owned verify layer for AngularJS islands. Core `motu island verify` runs static/config/
// runtime checks that are framework-neutral; it CANNOT judge the one coupling unique to this adapter —
// an island reaching into the ocean's AngularJS scope. This module contributes the SEMANTICS of that
// boundary, so the per-adapter external dependency becomes a declared, checkable contract.
//
// It operates on the STRUCTURED coupling the CLI extracts from element.ts via AST (no regex here, no
// ts-morph dependency): { adopt?, inheritScope?, hostScopeKey?, hostScope? }. Discovery is by package
// export (`@motu/adapter-angularjs/verify`), resolved from the adapter the island actually imports.

/**
 * @param {{ coupling?: { adopt?: string, inheritScope?: string, hostScopeKey?: string, hostScope?: string[] } }} input
 * @returns {{ level: 'error'|'warn'|'ok', check: string, msg: string }[]}
 */
export function checkCoupling({ coupling } = {}) {
  const findings = [];
  const c = coupling ?? {};
  const declared = Array.isArray(c.hostScope) ? c.hostScope : null;

  // SCOPE REACH = mechanisms that create a NEW inherited scope, so the island's markup resolves named
  // host-scope keys up the chain. These REQUIRE a declared `hostScope` manifest.
  const scopeReach = [];
  if (c.inheritScope) scopeReach.push('inheritScope');
  if (c.hostScopeKey) scopeReach.push('hostScopeKey');

  // adopt is DIFFERENT: it relocates an already-compiled live node, which keeps its OWN scope. The
  // island's own code reads no named host-scope key, so adopt couples to the legacy DOM (the selector),
  // NOT to a named scope — it does not require a hostScope manifest.
  if (c.adopt) {
    findings.push({
      level: 'ok',
      check: 'host-coupling',
      msg: `adopts '${c.adopt}' — couples to legacy DOM (relocates a live node); no named host-scope dependency`,
    });
  }

  if (scopeReach.length === 0) {
    if (!c.adopt) {
      if (declared) {
        findings.push({ level: 'warn', check: 'host-coupling', msg: `declares hostScope [${declared.join(', ')}] but reaches no host scope (no inheritScope/hostScopeKey) — the declaration is unused` });
      } else {
        findings.push({ level: 'ok', check: 'host-coupling', msg: 'no host-scope reach (isolate island)' });
      }
    }
    return findings;
  }

  if (!declared) {
    findings.push({
      level: 'error',
      check: 'host-coupling',
      msg: `reaches host scope via ${scopeReach.join('/')} but declares no \`hostScope\` — list the host-scope names it depends on (contract.coupling.hostScope)`,
    });
    return findings;
  }

  findings.push({
    level: 'ok',
    check: 'host-coupling',
    msg: `declares host-scope contract via ${scopeReach.join('/')}: [${declared.join(', ')}]`,
  });

  // The hostScopeKey anchor is itself a host-scope dependency; it should appear in the declaration.
  if (c.hostScopeKey && !declared.includes(c.hostScopeKey)) {
    findings.push({
      level: 'warn',
      check: 'host-coupling',
      msg: `hostScopeKey '${c.hostScopeKey}' isn't listed in hostScope — the anchor key is a host dependency too`,
    });
  }

  // Honest limit: verify can't reach the real embedded host — the declared keys must be provided by the
  // lagoon host stub, and that's all this layer can align.
  findings.push({
    level: 'warn',
    check: 'host-scope-stub',
    msg: `lagoon host stub must provide [${declared.join(', ')}]; verify can't confirm the real embedded host does — keep an integration check`,
  });

  return findings;
}
