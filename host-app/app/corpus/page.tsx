// The corpus screen. A SERVER component: it reads the host's own coverage table and hands the rows to
// the client boundary.
//
// NO NEW BACKEND SURFACE. `readCorpus` and `known` already existed and are already tested
// (`test/coverage-divergence.test.ts`) — this page reads them and adds nothing, which is the rule
// from CLAUDE.md about never widening a boundary further than the one method you need.
import { fingerprintId } from '@motu/coverage';
import { CorpusScreen } from '@/app/corpus/corpus-screen';
import type { CorpusState } from '@/app/corpus/corpus-region';
import { known, readCorpus } from '@/src/coverage/store';

export const dynamic = 'force-dynamic';

export default async function CorpusPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined, fallback: string) =>
    typeof v === 'string' && v ? v : fallback;

  const projectId = first(params.project, 'motu-host');
  const regionId = first(params.region, 'signin');
  const keysHash = first(params.keys, '');

  // A corpus this host has never been posted is an EMPTY corpus, not an error: the instrument is
  // opt-in (`coverage.enabled` defaults to false), so "nothing recorded" is the ordinary first answer
  // and the screen says so in its own words.
  const [corpus, acceptedIds] = await Promise.all([
    readCorpus(projectId, regionId, keysHash, []),
    known(projectId, regionId, keysHash),
  ]);

  const total = corpus.entries.reduce((n, e) => n + e.count, 0);
  const accepted = new Set(acceptedIds);
  const states: CorpusState[] = corpus.entries.map((entry) => {
    // `fingerprintId` is what the corpus counts by and what `known()` returns, so it is what matches
    // a row to its acceptance. Recomputing it here rather than storing a second id keeps one identity.
    const id = fingerprintId(entry.fingerprint);
    return {
      id,
      fingerprint: entry.fingerprint as Record<string, string>,
      count: entry.count,
      share: total ? entry.count / total : 0,
      accepted: accepted.has(id),
    };
  });

  return <CorpusScreen states={states} regionId={regionId} />;
}
