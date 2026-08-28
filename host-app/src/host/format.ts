// `views.mjs`'s `size()`, copied because it is not exported from that module.
//
// COPIED EXACTLY, including the fact that it is cruder than it looks: two branches, MB above a
// megabyte and rounded kB below it, with no GB step at all. A "better" version — units array, TB
// ceiling — is what I wrote first, and it renders the same host as "76.3 MB" or "0.1 GB" depending
// on which module you ask. On a page whose whole job is to report what the host holds, two answers is
// worse than a crude one. The test beside it pins the two together for as long as both exist.
export function size(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`
}
