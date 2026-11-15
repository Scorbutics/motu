// One ts-morph program per process, instead of one per question.
//
// Every static check used to build its own Project and re-parse the file it was about to read: the
// component for the props check, the same component for the contract, the island file for coupling,
// the island file again for the mount-point rules. Parsing is the expensive part of a static verify —
// a sweep of fifteen islands spent most of its wall clock re-reading files it had already read.
//
// The projects here are keyed by compiler options and cached for the life of the command, so a file is
// parsed once no matter how many checks ask about it. They are READ-ONLY: anything that rewrites
// source (create, eject, integrate) keeps its own Project, because a shared one would carry another
// command's edits.
import { Project } from 'ts-morph';

const projects = new Map();

/** A shared, read-only Project for these compiler options. */
export function sharedProject(compilerOptions = { allowJs: true }) {
  const key = JSON.stringify(compilerOptions);
  let project = projects.get(key);
  if (!project) {
    project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions,
    });
    projects.set(key, project);
  }
  return project;
}

/**
 * The source file at `path`, parsed at most once.
 *
 * `refreshFromFileSystemSync` is deliberate rather than paranoid: a long-running command (the lagoon's
 * watch mode) can ask about a file that changed since it was first read.
 */
export function sourceFileAt(path, compilerOptions) {
  const project = sharedProject(compilerOptions);
  const existing = project.getSourceFile(path);
  if (existing) return existing;
  return project.addSourceFileAtPath(path);
}

/**
 * `sf.getDescendantsOfKind(kind)`, walked once per file per kind for the life of the command.
 *
 * The integration check asks the SAME files the same questions once per region — where islands are
 * placed, which are conditional, what the page passes — and each question walked every host file's
 * whole tree again. On Peps (24 regions, every host source) that was 78s of a 106s static
 * `motu check`, nearly all of it inside ts-morph's descendant iterator. The files come from the shared
 * project above, which is read-only by contract, so the walk's answer cannot change under it.
 */
const descendantCache = new WeakMap();
export function descendantsOfKind(sf, kind) {
  let byKind = descendantCache.get(sf);
  if (!byKind) {
    byKind = new Map();
    descendantCache.set(sf, byKind);
  }
  let nodes = byKind.get(kind);
  if (!nodes) {
    nodes = sf.getDescendantsOfKind(kind);
    byKind.set(kind, nodes);
  }
  return nodes;
}
