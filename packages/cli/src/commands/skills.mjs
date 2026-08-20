// `motu skills install [dir]` — install the motu agent skills into a target repo.
//
// The skills are the JUDGEMENT half of motu (island-extract / island-create); the CLI is the
// deterministic half. A repo that uses motu needs both, in whatever format its coding agent reads.
// One source, two emitted formats — so they can never drift:
//
//   .github/agents/<name>.agent.md    (source of truth: frontmatter name/description + body)
//     ├─ .github/agents/<name>.agent.md    GitHub Copilot custom agent   (verbatim copy)
//     ├─ .github/prompts/<name>.prompt.md  Copilot slash-prompt          (verbatim copy, if present)
//     └─ .claude/skills/<name>/SKILL.md    Claude Code skill             (generated from the agent)
//
// Deliberately config-free: this verb installs INTO a repo that may not be a motu project yet, so it
// never reads motu.config.json and never touches the island layout.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { color, HOST_ROOT } from '../lib/util.mjs';
import { applyHostRules } from '../lib/host-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
/** The motu checkout that owns this CLI (packages/cli/src/commands → repo root). */
const MOTU_ROOT = resolve(here, '../../../..');
const SRC_AGENTS = resolve(MOTU_ROOT, '.github/agents');
const SRC_PROMPTS = resolve(MOTU_ROOT, '.github/prompts');

/** Parse a leading `---` YAML-ish frontmatter block into { data, body, raw }. */
function frontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { data: {}, body: raw, raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: raw.slice(m[0].length), raw };
}

/** The skills shipped by this motu checkout, newest source first. */
function discover() {
  if (!existsSync(SRC_AGENTS)) return [];
  return readdirSync(SRC_AGENTS)
    .filter((f) => f.endsWith('.agent.md'))
    .sort()
    .map((file) => {
      const agentPath = resolve(SRC_AGENTS, file);
      const raw = readFileSync(agentPath, 'utf8');
      const { data, body } = frontmatter(raw);
      const name = data.name ?? file.replace(/\.agent\.md$/, '');
      const promptPath = resolve(SRC_PROMPTS, `${name}.prompt.md`);
      return {
        name,
        description: data.description ?? '',
        agent: { path: agentPath, raw },
        prompt: existsSync(promptPath) ? { path: promptPath, raw: readFileSync(promptPath, 'utf8') } : null,
        body,
      };
    });
}

/** A Claude Code SKILL.md: the same body, under the frontmatter keys Claude reads. */
function skillMd(skill) {
  const description = skill.description.replace(/\r?\n/g, ' ').trim();
  return `---\nname: ${skill.name}\ndescription: ${description}\n---\n${skill.body.replace(/^\n*/, '\n')}`;
}

function put(path, contents, out) {
  const rel = relative(out.root, path);
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') === contents) return out.same.push(rel);
    if (!out.force) return out.skipped.push(rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    return out.updated.push(rel);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  out.created.push(rel);
}

export async function skillsInstallCommand(argv) {
  const root = resolve(process.cwd(), argv._[0] ?? '.');
  const only = argv.only ?? 'both'; // both | claude | copilot
  if (!['both', 'claude', 'copilot'].includes(only)) {
    console.error(color.red(`✗ --only must be one of: both, claude, copilot (got "${only}")`));
    process.exit(2);
  }
  const skills = discover();
  if (skills.length === 0) {
    console.error(color.red(`✗ no skills found in ${SRC_AGENTS} — is this a complete motu checkout?`));
    process.exit(1);
  }

  const out = { root, force: Boolean(argv.force), created: [], updated: [], same: [], skipped: [] };
  for (const skill of skills) {
    if (only !== 'claude') {
      put(resolve(root, '.github/agents', `${skill.name}.agent.md`), skill.agent.raw, out);
      if (skill.prompt) put(resolve(root, '.github/prompts', `${skill.name}.prompt.md`), skill.prompt.raw, out);
    }
    if (only !== 'copilot') {
      put(resolve(root, '.claude/skills', skill.name, 'SKILL.md'), skillMd(skill), out);
    }
  }

  if (argv.json) {
    console.log(JSON.stringify({ root, source: MOTU_ROOT, skills: skills.map((s) => s.name), ...out }, null, 2));
    return process.exit(out.skipped.length > 0 ? 1 : 0);
  }

  console.log(color.bold(`motu skills → ${root}`) + color.dim(`  (source: ${MOTU_ROOT})`));
  for (const p of out.created) console.log('  ' + color.green('+ ') + p);
  for (const p of out.updated) console.log('  ' + color.yellow('~ ') + p);
  for (const p of out.same) console.log('  ' + color.dim('= ' + p));
  for (const p of out.skipped) console.log('  ' + color.red('! ') + p + color.dim(' (differs — use --force to overwrite)'));
  console.log('');
  // The skills are the judgement half; the rules are the standing instructions that go with them, so
  // installing one installs the other. `motu init` does the same for a fresh project.
  // The rules belong to the HOST application — that is where the coding agent's instruction file
  // lives. Writing them beside the motu project (which is often a subfolder) created a second
  // CLAUDE.md nothing reads.
  const rules = applyHostRules(HOST_ROOT);

  console.log(color.green(`✓ ${skills.length} skill(s): ${skills.map((s) => s.name).join(', ')}`));
  for (const p of rules) console.log('  ' + color.dim(p) + color.dim(' (motu rules block)'));
  if (out.skipped.length) {
    console.log(color.yellow(`  ${out.skipped.length} file(s) left untouched — rerun with --force to overwrite`));
    process.exit(1);
  }
  console.log('Use them: ' + color.bold('/island-create') + ' or ' + color.bold('/island-extract') + color.dim(' (Claude Code skill or Copilot agent/prompt)'));
}

export async function skillsListCommand(argv) {
  const skills = discover();
  if (argv.json) {
    console.log(JSON.stringify(skills.map(({ name, description }) => ({ name, description })), null, 2));
    return;
  }
  for (const s of skills) {
    console.log(color.bold(s.name));
    console.log('  ' + color.dim(s.description));
  }
}
