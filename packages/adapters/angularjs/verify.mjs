// Adapter-owned verify layer for AngularJS islands. Core `motu island verify` runs static/config/
// runtime checks that are framework-neutral; it CANNOT judge the one coupling unique to this adapter —
// an island reaching into the ocean's AngularJS scope. This module contributes the SEMANTICS of that
// boundary, so the per-adapter external dependency becomes a declared, checkable contract.
//
// It operates on the STRUCTURED coupling the CLI extracts from element.ts via AST (no regex here, no
// ts-morph dependency): { adopt?, inheritScope?, hostScopeKey?, hostScope? }. Discovery is by package
// export (`@motu/adapter-angularjs/verify`), resolved from the adapter the island actually imports.

/**
 * `hostScope` is the `scope:…` half of `contract.effects`, already unprefixed by the caller; the rest
 * is `mount`. One argument still, because the question spans both: a mechanism that creates an
 * inherited scope is only safe if the names it resolves are declared.
 *
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
      msg: `reaches host scope via ${scopeReach.join('/')} but declares no scope names — list them in \`contract.effects\` as \`scope:…\``,
    });
    return findings;
  }

  // THE CAVEAT RIDES ON THE OK LINE, and used to be its own standing `host-scope-stub` WARNING.
  // It fired unconditionally whenever a host-scope contract was declared, so there was no state in
  // which it could be cleared except deleting the correct declaration it was praising — and on the
  // ocean project it was 100% of the warnings. A warning nobody can action teaches people to stop
  // reading warnings, which is expensive here because warnings carry real findings elsewhere.
  findings.push({
    level: 'ok',
    check: 'host-coupling',
    msg:
      `declares host-scope contract via ${scopeReach.join('/')}: [${declared.join(', ')}] — the lagoon ` +
      `stub must supply these; verify cannot reach the real embedded host, so an integration check is still owed`,
  });

  // The hostScopeKey anchor is itself a host-scope dependency; it should appear in the declaration.
  if (c.hostScopeKey && !declared.includes(c.hostScopeKey)) {
    findings.push({
      level: 'warn',
      check: 'host-coupling',
      msg: `hostScopeKey '${c.hostScopeKey}' isn't listed in hostScope — the anchor key is a host dependency too`,
    });
  }


  return findings;
}
