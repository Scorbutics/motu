import { MISTAKES } from './blind.mjs';

// The lies, as exact edits to the shlink baseline (branch `bench-evidence`, commits 417c885 motu /
// 938fa45 Storybook — written by an agent that had not seen this file).
//
// EACH LIE IS TOLD TO EACH HARNESS SEPARATELY. A `motu` variant edits only motu's evidence; a `sb`
// variant edits only the stories. The app's own `tsc` runs for both, and a catch by `tsc` is credited
// to the harness whose evidence was edited — Storybook's typed fixtures earn their row the same way
// motu's `import type` evidence does. A `shared` variant edits the APP, and every tool is asked.
//
// Every edit keeps the tree compiling apart from the lie itself (`noUnusedLocals` is on in shlink): a
// cheat that leaves an unused import behind is scored as a catch by `tsc` for the wrong reason.
//
// `expect` is the PRE-REGISTERED outcome from README.md (true = refused), per family, and is never
// edited after a run. E10 was added after pre-registration and says so.

const FLOWS = 'src/archipelagos/manage-servers/manage-servers.evidence.ts';
const LIST_SCENARIOS = 'src/islands/manage-servers-list.evidence.ts';
const SHARED_EVIDENCE = 'src/shared/manage-servers-evidence.ts';
const WIRE = 'roots/lagoon/src/manage-servers-shell.tsx';
const SB_LIST = 'src/servers/stories/ManageServersList.stories.tsx';
const SB_BOTH = 'src/servers/stories/ManageServersSearchAndList.stories.tsx';
const SB_FIXTURES = 'src/servers/stories/fixtures.ts';
const PAGE = 'src/servers/ManageServers.tsx';

const MAIN_SERVER = "  'main-shlink': { id: 'main-shlink', name: 'Main shlink', url: 'https://shlink.example.com', apiKey: 'main-api-key' },";
const LOCAL_DEV = "  'local-dev': { id: 'local-dev', name: 'Local dev', url: 'http://localhost:8080', apiKey: 'local-api-key' },";

// The Storybook failure story's handler and the wait on it — removed by E5 and E10.
const SB_FAILURE_HANDLER = `let remoteFailureServed = false;

/** Empty store on load, and \`/servers.json\` fails: the error is swallowed and the list is empty. */
export const RemoteServersFailToLoad: Story = {
  parameters: { servers: {} },
  beforeEach: ({ msw }) => {
    remoteFailureServed = false;
    msw.use(
      http.get('*/servers.json', () => {
        remoteFailureServed = true;
        return HttpResponse.json({ error: 'boom' }, { status: 500 });
      }),
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(remoteFailureServed).toBe(true));
    await expect(canvas.getByText('No servers found.')).toBeInTheDocument();
  },
};`;
const SB_FAILURE_NO_HANDLER = `/** Empty store on load, and \`/servers.json\` fails: the error is swallowed and the list is empty. */
export const RemoteServersFailToLoad: Story = {
  parameters: { servers: {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText('No servers found.')).toBeInTheDocument());
  },
};`;

export const CHEATS = [
  {
    id: 'E1',
    name: 'an assertion that holds whatever the input',
    expect: { motu: true, 'storybook-default': false, 'storybook-strict': false },
    motu: [
      {
        file: FLOWS,
        find: "        emit: { slot: 'manage-servers-search', event: 'search-term-change', detail: 'staging' },\n        expectRender: { 'manage-servers-list': { text: 'staging.shlink.example.com', notText: 'Main shlink' } },",
        replace: "        emit: { slot: 'manage-servers-search', event: 'search-term-change', detail: 'staging' },\n        expectRender: { 'manage-servers-search': 'Search...' },",
      },
    ],
    sb: [
      {
        file: SB_BOTH,
        find: "    await waitFor(() => expect(canvas.queryByText('Main shlink')).not.toBeInTheDocument());\n    await expect(canvas.getByText('https://staging.shlink.example.com')).toBeInTheDocument();",
        replace: "    await expect(canvas.getByPlaceholderText('Search...')).toBeInTheDocument();",
      },
    ],
  },
  {
    id: 'E2',
    name: 'two states with different names and one render',
    expect: { motu: true, 'storybook-default': false, 'storybook-strict': false },
    motu: [
      {
        file: LIST_SCENARIOS,
        find: "  { name: 'servers in the store', seed: { searchTerm: '', servers: LOCAL_SERVERS } },",
        replace:
          "  { name: 'servers in the store', seed: { searchTerm: '', servers: LOCAL_SERVERS } },\n" +
          "  { name: 'servers saved locally', seed: { searchTerm: '', servers: LOCAL_SERVERS } },",
      },
    ],
    sb: [
      {
        file: SB_LIST,
        find: '/** One auto-connect server:',
        replace:
          "/** Servers saved locally. */\nexport const ServersSavedLocally: Story = {\n  parameters: { servers: LOCAL_SERVERS },\n" +
          "  play: async ({ canvasElement }) => {\n    await expect(within(canvasElement).getByText('Main shlink')).toBeInTheDocument();\n  },\n};\n\n" +
          '/** One auto-connect server:',
      },
    ],
  },
  {
    id: 'E3',
    name: "a fixture field the app's type does not have",
    expect: { motu: true, 'storybook-default': false, 'storybook-strict': true },
    motu: [{ file: SHARED_EVIDENCE, find: MAIN_SERVER, replace: MAIN_SERVER.replace(" apiKey: 'main-api-key' },", " apiKey: 'main-api-key', region: 'eu' },") }],
    sb: [{ file: SB_FIXTURES, find: MAIN_SERVER, replace: MAIN_SERVER.replace(" apiKey: 'main-api-key' },", " apiKey: 'main-api-key', region: 'eu' },") }],
  },
  {
    id: 'E4',
    name: 'a value the type allows and the app never produces',
    unrefusable: true,
    expect: { motu: false, 'storybook-default': false, 'storybook-strict': false },
    motu: [{ file: SHARED_EVIDENCE, find: LOCAL_DEV, replace: LOCAL_DEV.replace("'http://localhost:8080'", "'http://localhost:8080/archived'") }],
    sb: [{ file: SB_FIXTURES, find: LOCAL_DEV, replace: LOCAL_DEV.replace("'http://localhost:8080'", "'http://localhost:8080/archived'") }],
  },
  {
    id: 'E5',
    name: 'the failure state comes from a call nothing declared, swallowed by the app',
    expect: { motu: true, 'storybook-default': false, 'storybook-strict': true },
    motu: [
      {
        file: WIRE,
        find: "          throw new MotuError(500, 'servers.json: declared failure', true);",
        replace: "          throw new MotuError(500, 'servers.json: failed');",
      },
    ],
    sb: [
      { file: SB_LIST, find: SB_FAILURE_HANDLER, replace: SB_FAILURE_NO_HANDLER },
      {
        file: SB_LIST,
        find: "  parameters: { servers: {} },\n  // Remote servers are only fetched when the store starts empty. By default they answer an empty list.\n  beforeEach: ({ msw }) => {\n    msw.use(http.get('*/servers.json', () => HttpResponse.json([])));\n  },\n",
        replace: '  parameters: { servers: {} },\n',
      },
    ],
  },
  {
    id: 'E7',
    name: 'the page drifts from the evidence: it stops placing the list in the region',
    expect: { motu: true, 'storybook-default': false, 'storybook-strict': false },
    shared: [
      {
        file: PAGE,
        find: '      <ManageServersR.Island slot="manage-servers-list">\n        <ManageServersList />\n      </ManageServersR.Island>',
        replace: '      <ManageServersList />',
      },
    ],
  },
  {
    id: 'E8',
    name: 'a slot no evidence ever looks at',
    expect: { motu: true },
    motu: [
      {
        file: FLOWS,
        find: "    steps: [{ expectRender: { 'manage-servers-search': 'Search...', 'manage-servers-list': 'Main shlink' } }],",
        replace: "    steps: [{ expectRender: { 'manage-servers-list': 'Main shlink' } }],",
      },
    ],
  },
  {
    id: 'E10',
    name: 'the "failure" state is not a failure — the load answers an empty list (added after pre-registration)',
    postRegistration: true,
    motu: [
      {
        file: WIRE,
        find: "        if (remote === REMOTE_FAILS) {\n          throw new MotuError(500, 'servers.json: declared failure', true);\n        }\n        return remote ?? [];",
        replace: '        void MotuError;\n        return Array.isArray(remote) ? remote : [];',
      },
    ],
    sb: [{ file: SB_LIST, find: SB_FAILURE_HANDLER, replace: SB_FAILURE_NO_HANDLER }],
  },
  // COUNTER-CHEATS, chosen by the bench's author to favour a harness that drives REAL user events —
  // Storybook's play functions type into the input; motu's `emit` enters the region past the
  // component's own handler (CLAUDE.md: "a handler that ignores its argument passes every flow you can
  // write"). Added after the first results, to test whether the cheat set was tilted. Labelled so the
  // author's bias is visible in both directions.
  {
    id: 'S1',
    name: 'the search box reports an empty term whatever was typed (the handler ignores its argument)',
    authorChosenFor: 'storybook',
    shared: [
      {
        file: 'src/servers/ManageServersSearch.tsx',
        find: '  <SearchInput onChange={(searchTerm) => onSearchTermChange?.(searchTerm)} />',
        replace: "  <SearchInput onChange={(searchTerm) => onSearchTermChange?.(searchTerm.slice(searchTerm.length))} />",
      },
    ],
  },
  {
    id: 'S2',
    name: 'the search box stops reporting an empty term, so clearing it never restores the list',
    authorChosenFor: 'storybook',
    shared: [
      {
        file: 'src/servers/ManageServersSearch.tsx',
        find: '  <SearchInput onChange={(searchTerm) => onSearchTermChange?.(searchTerm)} />',
        replace: '  <SearchInput onChange={(searchTerm) => (searchTerm ? onSearchTermChange?.(searchTerm) : undefined)} />',
      },
    ],
  },
];

/**
 * Where a blind mistake lands decides who faces it: an edit to one harness's evidence is told to that
 * harness alone; anything touching the APP (or the app's own tests) is told to every tool.
 */
const MOTU_EVIDENCE = (f) => /\.evidence\.ts$|^src\/archipelagos\/|^src\/shared\/manage-servers-evidence|^roots\/lagoon\//.test(f);
const SB_EVIDENCE = (f) => /^src\/servers\/stories\/|^\.storybook\//.test(f);
for (const m of MISTAKES) {
  const files = m.edits.map((e) => e.file);
  const variant = files.every(MOTU_EVIDENCE) ? 'motu' : files.every(SB_EVIDENCE) ? 'sb' : 'shared';
  CHEATS.push({ id: m.id, name: m.name, why: m.why, kind: m.kind, blind: true, [variant]: m.edits });
}
