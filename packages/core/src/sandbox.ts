// TWO FACTS CORE HOLDS ABOUT COVERAGE, AND NOTHING ELSE.
//
// The fold, the fingerprint, the beacon and the comparison all live in `@motu/coverage`, which core
// never imports. What is left here is the minimum that cannot live there:
//
//   * WHETHER THIS IS THE SANDBOX. The lagoon says so before anything mounts, and `@motu/react` must
//     be able to say it without depending on a package the project may not have installed. It is also
//     not really a coverage fact — it is a fact about the environment, and anything else that must
//     behave differently in a preview can read it.
//   * A SEAM the coverage package fills. `defineArchipelago` is where both mount paths meet, so it is
//     where a region has to be picked up; calling into coverage directly would put that module in
//     every project's graph whether or not it is enabled, and no bundler can drop a module something
//     calls. The same arrangement core already has with the seam lens, which it also never imports.

let sandbox = false;

/**
 * This is the lagoon. Called by both lagoon entries before any region mounts.
 *
 * The one thing it currently governs is coverage egress, and that rule is a framework rule rather
 * than a config field because no configuration should be able to arrange the alternative: a lagoon
 * that beacons posts the states its own FLOWS produce into the corpus, and the next comparison then
 * reports them as covered in production. The tool would validate itself, and the report would look
 * better rather than broken.
 */
export function markSandbox(): void {
  sandbox = true;
}

/** Whether this is a preview rather than a real page. */
export function isSandbox(): boolean {
  return sandbox;
}

/** What `@motu/coverage` registers: pick up a region as it is defined. */
export type RegionCoverageInstaller = (regionId: string, opts: { enums?: readonly string[] }) => void;

let installer: RegionCoverageInstaller | null = null;

/** Fill the seam. Called by `configureCoverage`, which the generated island registry calls. */
export function setRegionCoverageInstaller(fn: RegionCoverageInstaller | null): void {
  installer = fn;
}

/** Offer a region to whatever filled the seam. A no-op — and a dead branch — when nothing did. */
export function offerRegionToCoverage(regionId: string, opts: { enums?: readonly string[] }): void {
  installer?.(regionId, opts);
}
