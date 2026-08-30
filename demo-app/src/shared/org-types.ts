// The org structure the Org Lookup screen drills through: a company, its departments, its people.
//
// FIXTURE DATA WITH A REAL SHAPE. The company typeahead talks to the console's own search endpoint
// and comes back with loosely-typed rows, so the drill-down below it cannot be fed by that same call
// without a backend to answer for departments. It is answered here instead, by the archipelago's own
// handler — which is what the page would do, and what a `channel` does once there is a real one.

export interface OrgPerson {
  id: string;
  name: string;
  role: string;
  email: string;
  /** Whether this person leads the department they sit in. */
  lead?: boolean;
}

export interface OrgDepartment {
  id: string;
  name: string;
  /** Where in the company it sits, for the tree's indentation. 0 is a division. */
  depth: number;
  people: OrgPerson[];
}

/** Every department of one company, in tree order. */
export type OrgChart = OrgDepartment[];

const ATLAS: OrgChart = [
  { id: 'eng', name: 'Engineering', depth: 0, people: [
    { id: 'p1', name: 'Amara Osei', role: 'VP Engineering', email: 'amara@atlas.example', lead: true },
    { id: 'p2', name: 'Tomas Brandt', role: 'Staff Engineer', email: 'tomas@atlas.example' },
    { id: 'p3', name: 'Wei Chen', role: 'Engineer', email: 'wei@atlas.example' },
  ]},
  { id: 'eng-platform', name: 'Platform', depth: 1, people: [
    { id: 'p4', name: 'Ines Duarte', role: 'Tech Lead', email: 'ines@atlas.example', lead: true },
    { id: 'p5', name: 'Karl Meyer', role: 'Engineer', email: 'karl@atlas.example' },
  ]},
  { id: 'eng-product', name: 'Product Engineering', depth: 1, people: [
    { id: 'p6', name: 'Sofia Ricci', role: 'Tech Lead', email: 'sofia@atlas.example', lead: true },
    { id: 'p7', name: 'Dan Whitfield', role: 'Engineer', email: 'dan@atlas.example' },
    { id: 'p8', name: 'Priya Nair', role: 'Engineer', email: 'priya@atlas.example' },
    { id: 'p12', name: 'Noah Berger', role: 'Engineer', email: 'noah@atlas.example' },
    { id: 'p13', name: 'Leila Haddad', role: 'Senior Engineer', email: 'leila@atlas.example' },
    { id: 'p14', name: 'Marco Silva', role: 'Engineer', email: 'marco@atlas.example' },
    { id: 'p15', name: 'Hannah Weiss', role: 'QA Engineer', email: 'hannah@atlas.example' },
  ]},
  { id: 'design', name: 'Design', depth: 0, people: [
    { id: 'p9', name: 'Luc Fontaine', role: 'Design Lead', email: 'luc@atlas.example', lead: true },
    { id: 'p10', name: 'Mira Kovac', role: 'Product Designer', email: 'mira@atlas.example' },
    { id: 'p16', name: 'Theo Lambert', role: 'Brand Designer', email: 'theo@atlas.example' },
  ]},
  { id: 'design-research', name: 'User Research', depth: 1, people: [
    { id: 'p17', name: 'Anouk Visser', role: 'Researcher', email: 'anouk@atlas.example', lead: true },
    { id: 'p18', name: 'Ravi Menon', role: 'Researcher', email: 'ravi@atlas.example' },
  ]},
  { id: 'ops', name: 'Operations', depth: 0, people: [
    { id: 'p11', name: 'Grace Mbeki', role: 'Head of Ops', email: 'grace@atlas.example', lead: true },
  ]},
];

const HELIOS: OrgChart = [
  { id: 'field', name: 'Field Services', depth: 0, people: [
    { id: 'h1', name: 'Ana Ruiz', role: 'Regional Director', email: 'ana@helios.example', lead: true },
    { id: 'h2', name: 'Piotr Nowak', role: 'Field Engineer', email: 'piotr@helios.example' },
  ]},
  { id: 'field-north', name: 'North Region', depth: 1, people: [
    { id: 'h3', name: 'Erik Lund', role: 'Team Lead', email: 'erik@helios.example', lead: true },
  ]},
  { id: 'support', name: 'Customer Support', depth: 0, people: [
    { id: 'h4', name: 'Yuki Tanaka', role: 'Support Manager', email: 'yuki@helios.example', lead: true },
    { id: 'h5', name: 'Omar Haddad', role: 'Support Engineer', email: 'omar@helios.example' },
  ]},
];

/** A company row's display name, however the backing service happened to spell it. */
export function companyName(row: Record<string, unknown> | null | undefined): string {
  if (!row) return '';
  for (const key of ['name', 'label', 'companyName', 'description']) {
    const v = row[key];
    if (typeof v === 'string') return v;
  }
  const first = Object.values(row).find((v) => typeof v === 'string');
  return (first as string) ?? '';
}

/**
 * The chart for whichever company was picked.
 *
 * Two charts and a default, so switching company visibly changes the whole screen below it — a
 * lookup that always answered the same thing would make the drill-down look wired when it is not.
 */
export function orgChartFor(row: Record<string, unknown> | null | undefined): OrgChart {
  const name = companyName(row).toLowerCase();
  if (name.includes('helios')) return HELIOS;
  return ATLAS;
}

/** A company row shaped like the ones the lookup's backing service returns. */
export const ATLAS_COMPANY: Record<string, unknown> = { id: 'atlas', name: 'Atlas Industries', code: 'ATL' };
export const HELIOS_COMPANY: Record<string, unknown> = { id: 'helios', name: 'Helios Energy', code: 'HEL' };

export { ATLAS as ATLAS_CHART, HELIOS as HELIOS_CHART };
