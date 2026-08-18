import { useEffect, useRef, useState } from 'react';
import { CompanyGroupService } from '@motu/contract';
import { MotuError } from '@motu/runtime';

/** Loosely typed row — the backing method returns List<Map<String,Object>>. */
export type CompanyRow = Record<string, unknown>;

export interface CompanyLookupProps {
  prefix?: string;
  /** Fired when a company row is chosen. */
  onCompanySelected?: (row: CompanyRow) => void;
}

function label(row: CompanyRow): string {
  for (const key of ['name', 'label', 'companyName', 'description']) {
    const v = row[key];
    if (typeof v === 'string') return v;
  }
  const first = Object.values(row).find((v) => typeof v === 'string');
  return (first as string) ?? JSON.stringify(row);
}

/**
 * A company typeahead backed by the browser-callable console company search endpoint. Mode-agnostic:
 * it has no idea whether it is embedded, standalone or sandboxed — all it does is call the contract
 * and emit outward. No fetch, no history, no document reach-out.
 */
export function CompanyLookup({ prefix = '', onCompanySelected }: CompanyLookupProps) {
  const [term, setTerm] = useState(prefix);
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'forbidden' | 'error'>('idle');
  const seq = useRef(0);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setRows([]);
      setStatus('idle');
      return;
    }
    const mine = ++seq.current;
    setStatus('loading');
    const handle = setTimeout(() => {
      CompanyGroupService.search(0, { name: q })
        .then((result) => {
          if (mine !== seq.current) return;
          setRows(result?.list ?? []);
          setStatus('idle');
        })
        .catch((err) => {
          if (mine !== seq.current) return;
          if (err instanceof MotuError && err.status === 403) setStatus('forbidden');
          else setStatus('error');
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [term]);

  if (status === 'forbidden') {
    return <div className="motu-note">You don't have permission to search organisations.</div>;
  }

  return (
    <div className="motu-lookup">
      <input
        className="motu-input"
        type="text"
        placeholder="Search organisations…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        aria-label="Organisation search"
      />
      {status === 'loading' && <div className="motu-note">Searching…</div>}
      {status === 'error' && <div className="motu-note">Something went wrong.</div>}
      <ul className="motu-results">
        {rows.map((row, i) => {
          const text = label(row);
          return (
            <li key={i}>
              <button type="button" className="motu-row" onClick={() => onCompanySelected?.(row)}>
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
