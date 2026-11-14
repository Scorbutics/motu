// The BLIND set: mistakes proposed by an agent that was told nothing about either tool and could not
// read motu's docs or rules (bench/evidence/README.md, 'Blind cheat selection'). Verbatim from its
// report — not edited, not filtered. Each one was typechecked alone against the clean tree.

export const MISTAKES = [
  {
    id: 'B1',
    name: 'Search stops matching on the server URL',
    why: 'Asked to fix the crash when the user types a regex metacharacter like "(" or "+" (filterServers feeds the term to String.match), the agent rewrote the filter with includes() and, simplifying the template string, kept only the name.',
    kind: 'a',
    edits: [
      {
        file: 'src/servers/ManageServersList.tsx',
        find: "  servers.filter(({ name, url }) => `${name} ${url}`.toLowerCase().match(searchTerm.toLowerCase()));",
        replace: '  servers.filter(({ name }) => name.toLowerCase().includes(searchTerm.toLowerCase()));',
      },
    ],
  },
  {
    id: 'B2',
    name: 'Search box never reports an emptied term, so clearing it does not restore the list',
    why: 'The agent wanted to avoid a spurious change event with an empty string on mount/initial render and guarded the callback on a truthy term, not noticing that clearing the box is also an empty string.',
    kind: 'a',
    edits: [
      {
        file: 'src/servers/ManageServersSearch.tsx',
        find: '  <SearchInput onChange={(searchTerm) => onSearchTermChange?.(searchTerm)} />',
        replace: '  <SearchInput onChange={(searchTerm) => searchTerm && onSearchTermChange?.(searchTerm)} />',
      },
    ],
  },
  {
    id: 'B3',
    name: 'Stale search term survives navigation (seed reset removed as "redundant")',
    why: 'Cleaning up, the agent saw the region binding already seeds searchTerm to "" and deleted the per-visit reset as duplicate; the region store outlives the page, so coming back shows an empty search box over a list still filtered by the previous term.',
    kind: 'a',
    edits: [
      {
        file: 'src/servers/ManageServers.tsx',
        find: "import { type FC, useLayoutEffect, useMemo } from 'react';",
        replace: "import { type FC, useMemo } from 'react';",
      },
      {
        file: 'src/servers/ManageServers.tsx',
        find: "  // Every visit starts with an empty search, as it did when the term was this page's own state. The\n  // region's store outlives the page (it is kept per region id), so it has to be re-established here.\n  useLayoutEffect(() => ManageServersR.seed('searchTerm', ''), []);\n",
        replace: '',
      },
    ],
  },
  {
    id: 'B4',
    name: 'Auto-connect column computed from the filtered rows, so it appears/disappears while typing',
    why: 'The agent "optimised" the list to derive everything from the rows actually rendered, moving hasAutoConnect onto filteredServers; the table layout now jumps as the user searches and the column vanishes when the auto-connect server is filtered out.',
    kind: 'a',
    edits: [
      {
        file: 'src/servers/ManageServersList.tsx',
        find: '  const hasAutoConnect = allServers.some(({ autoConnect }) => !!autoConnect);',
        replace: '  const hasAutoConnect = filteredServers.some(({ autoConnect }) => !!autoConnect);',
      },
    ],
  },
  {
    id: 'B5',
    name: 'Lagoon wire answers the "declared failure" with an empty list',
    why: 'The thrown 500 fixture was producing console noise / an unhandled rejection in the lagoon, and since "the app swallows the error anyway" the agent made the failure fixture return [] -- so the failure scenario and flow now exercise the success path with no servers and still pass.',
    kind: 'b',
    edits: [
      {
        file: 'roots/lagoon/src/manage-servers-shell.tsx',
        find: "import { MotuError } from '@motujs/runtime';\n",
        replace: '',
      },
      {
        file: 'roots/lagoon/src/manage-servers-shell.tsx',
        find: "        if (remote === REMOTE_FAILS) {\n          throw new MotuError(500, 'servers.json: declared failure', true);\n        }",
        replace: "        // A declared failure answers an empty list: the app swallows the error anyway, and a thrown\n        // fixture was flooding the console with an unhandled rejection.\n        if (remote === REMOTE_FAILS) {\n          return [];\n        }",
      },
    ],
  },
  {
    id: 'B6',
    name: 'Search story only checks that the callback was called, not with what',
    why: 'The story was flaky on per-keystroke values (or failed after a debounce/trim change), and the agent "stabilised" it by relaxing toHaveBeenLastCalledWith(\'staging\') to toHaveBeenCalled(), which now passes for any value, including a wrong or truncated term.',
    kind: 'b',
    edits: [
      {
        file: 'src/servers/stories/ManageServersSearch.stories.tsx',
        find: "    await waitFor(() => expect(args.onSearchTermChange).toHaveBeenLastCalledWith('staging'));",
        replace: '    await waitFor(() => expect(args.onSearchTermChange).toHaveBeenCalled());',
      },
    ],
  },
  {
    id: 'B7',
    name: 'Coupling flow asserts only a row that is present whether or not filtering happened',
    why: 'Simplifying a step that failed while the list was still re-rendering, the agent dropped notText and kept only the positive text -- but the staging URL is in the unfiltered list too, so the step no longer proves the search term reaches the list.',
    kind: 'b',
    edits: [
      {
        file: 'src/archipelagos/manage-servers/manage-servers.evidence.ts',
        find: "        expectRender: { 'manage-servers-list': { text: 'staging.shlink.example.com', notText: 'Main shlink' } },",
        replace: "        expectRender: { 'manage-servers-list': { text: 'staging.shlink.example.com' } },",
      },
    ],
  },
  {
    id: 'B8',
    name: 'Copy-pasted "fail to load" scenario actually seeds a successful remote answer',
    why: 'The agent duplicated the "remote servers load" scenario line to make the failure one, renamed it, and forgot to swap the seed; then removed the now-unused REMOTE_FAILS import the linter flagged. The scenario named "fail" shows the success state.',
    kind: 'b',
    edits: [
      {
        file: 'src/islands/manage-servers-list.evidence.ts',
        find: "  REMOTE_FAILS,\n",
        replace: '',
      },
      {
        file: 'src/islands/manage-servers-list.evidence.ts',
        find: "  { name: 'remote servers fail to load', seed: { searchTerm: '', servers: {}, remoteServers: REMOTE_FAILS } },",
        replace: "  { name: 'remote servers fail to load', seed: { searchTerm: '', servers: {}, remoteServers: REMOTE_SERVERS } },",
      },
    ],
  },
  {
    id: 'B9',
    name: 'Remote servers fetched on every load; deleted remote servers come back',
    why: 'Asked to make changes to servers.json reach users who already have servers, the agent dropped the "only when the store starts empty" guard. Every harness default-answers /servers.json (MSW [] / wire []), so nothing notices the new request, and the evidence comments ("no remote load happens") are now false.',
    kind: 'c',
    edits: [
      {
        file: 'src/servers/reducers/remoteServers.ts',
        find: "import { useCallback, useEffect, useRef } from 'react';",
        replace: "import { useCallback, useEffect } from 'react';",
      },
      {
        file: 'src/servers/reducers/remoteServers.ts',
        find: "import { createServers, useServers } from './servers';",
        replace: "import { createServers } from './servers';",
      },
      {
        file: 'src/servers/reducers/remoteServers.ts',
        find: "  const { fetchServers } = useRemoteServers();\n  const { servers } = useServers();\n  const initialServers = useRef(servers);\n\n  useEffect(() => {\n    // Try to fetch the remote servers if the list is empty during first render.\n    // We use a ref because we don't care if the servers list becomes empty later.\n    if (Object.keys(initialServers.current).length === 0) {\n      fetchServers();\n    }\n  }, [fetchServers]);",
        replace: "  const { fetchServers } = useRemoteServers();\n\n  useEffect(() => {\n    // Always refresh the remote servers, so changes to servers.json reach users who already have servers.\n    fetchServers();\n  }, [fetchServers]);",
      },
    ],
  },
  {
    id: 'B10',
    name: 'Search becomes case-sensitive, and the app test is edited to match',
    why: 'Fixing the regex crash, the agent replaced match() with includes() and dropped toLowerCase(); the app test searching "Ba" then failed and the agent "fixed the test" by lowering the term, so test and code now agree on the bug. Region flows and stories use lowercase terms that also hit the lowercase URL, so they stay green.',
    kind: 'c',
    edits: [
      {
        file: 'src/servers/ManageServersList.tsx',
        find: "  servers.filter(({ name, url }) => `${name} ${url}`.toLowerCase().match(searchTerm.toLowerCase()));",
        replace: '  servers.filter(({ name, url }) => `${name} ${url}`.includes(searchTerm));',
      },
      {
        file: 'test/servers/ManageServers.test.tsx',
        find: "    await search('Ba');",
        replace: "    await search('ba');",
      },
    ],
  },
  {
    id: 'B11',
    name: 'Page gets an empty-state instead of the list; harness layouts still render the list',
    why: 'Asked for a friendlier first-run screen, the agent made the page replace the table with a message when there are no servers. The lagoon layout and the Storybook SearchAndList composition are separate copies of the arrangement and still render the list, so the "remote servers fail to load" evidence keeps showing "No servers found." -- a screen the page no longer has.',
    kind: 'c',
    edits: [
      {
        file: 'src/servers/ManageServers.tsx',
        find: '      <ManageServersR.Island slot="manage-servers-list">\n        <ManageServersList />\n      </ManageServersR.Island>',
        replace: '      {allServers.length === 0 ? (\n        <div className="text-center">You have not added any servers yet. Import them or add one to get started.</div>\n      ) : (\n        <ManageServersR.Island slot="manage-servers-list">\n          <ManageServersList />\n        </ManageServersR.Island>\n      )}',
      },
    ],
  },
  {
    id: 'B12',
    name: 'Search moved into the toolbar on the page; lagoon layout still shows it above the list',
    why: 'Asked to put the search next to the Import/Export/Add buttons, the agent moved the island inside the toolbar row in the page only; the lagoon override\'s layout still places the search full-width directly above the list, so every region preview and snapshot shows the old arrangement.',
    kind: 'c',
    edits: [
      {
        file: 'src/servers/ManageServers.tsx',
        find: '      <ManageServersR.Island slot="manage-servers-search">\n        <ManageServersSearch />\n      </ManageServersR.Island>\n\n      <div className="flex flex-col md:flex-row gap-2">\n',
        replace: '      <div className="flex flex-col md:flex-row gap-2">\n        <ManageServersR.Island slot="manage-servers-search">\n          <ManageServersSearch />\n        </ManageServersR.Island>\n',
      },
    ],
  },
];
