// SIX COUPLING DEFECTS — the class motu claims, and the class that lives between components.
//
// Not logic inside a component (a filter that stops matching, `some` for `every`, an off-by-one).
// Those are a unit test's job and motu says so. These are the ones that live in the SEAM: the page
// and the region disagreeing about who fills what, who owns what, and who reads what. Nothing in a
// component's own test can see them, because each component is individually correct.
//
// Each is a realistic slip, mechanically injectable and reversible, and each `find` must appear
// EXACTLY ONCE in its file or the run refuses — a mutation that silently hit the wrong line, or
// nothing, is worse than no experiment.
export const DEFECTS = [
  {
    id: 'C1',
    name: 'the two islands are placed in each other’s slots',
    why: 'A copy-paste in the page. Both components render, both are individually correct, and the region shows the search where the list belongs.',
    file: 'src/servers/ManageServers.tsx',
    find: '<ManageServersRegion.Island slot="manage-servers-search">\n            <ManageServersSearch />',
    replace: '<ManageServersRegion.Island slot="manage-servers-search">\n            <ManageServersList />',
  },
  {
    id: 'C2',
    name: 'a second island claims a key another already produces',
    why: 'Two agents, two branches, one key. The store then has two writers and no owner.',
    file: 'src/archipelagos/manage-servers/manage-servers.archipelago.ts',
    find: "    slot: 'manage-servers-list',",
    replace: "    slot: 'manage-servers-list',\n    writes: { search: 'searchTerm' },",
  },
  {
    id: 'C3',
    name: 'a slot name typo in the page',
    why: 'The island is placed at a slot the region does not declare, so nothing fills the real one.',
    file: 'src/servers/ManageServers.tsx',
    find: 'slot="manage-servers-list"',
    replace: 'slot="manage-servers-serch-list"',
  },
  {
    id: 'C4',
    name: 'the reader stops binding the key it reads',
    why: 'The producer still writes `searchTerm`; the list no longer binds it, so it silently renders unfiltered forever.',
    file: 'src/archipelagos/manage-servers/manage-servers.archipelago.ts',
    find: "    bind: ['searchTerm'],",
    replace: '',
  },
  {
    id: 'C5',
    name: 'the declared write is wired to an event the island does not emit',
    why: 'A rename on the island that the archipelago did not follow. The key is declared, owned, and never written.',
    file: 'src/archipelagos/manage-servers/manage-servers.archipelago.ts',
    find: "    writes: { search: 'searchTerm' },",
    replace: "    writes: { onSearchChanged: 'searchTerm' },",
  },
  {
    id: 'C6',
    name: 'the region is composed but never wrapped',
    why: 'The `<Region>` provider is dropped in a refactor. Every island still renders and none of them shares a store — so the page is syntactically perfect and the coupling is gone.',
    // BOTH TAGS, so the result COMPILES. The first version replaced only the opening tag, which left an
    // unmatched closer: `tsc` then caught a syntax error and the row scored as "the compiler catches
    // this", which is true of the typo and false of the defect. A defect that does not compile tests
    // nothing about composition.
    edits: [
      { file: 'src/servers/ManageServers.tsx', find: '<ManageServersRegion.Region>', replace: '<>' },
      { file: 'src/servers/ManageServers.tsx', find: '</ManageServersRegion.Region>', replace: '</>' },
    ],
  },
];
