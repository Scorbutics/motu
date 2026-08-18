import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MemberService } from '@motu/contract';
import { MotuError } from '@motu/runtime';
import { firstString, type MemberCriteria, type MemberPage, type MemberRow } from '../../shared/member-types.js';

export interface MemberResultsProps {
  criteria?: MemberCriteria;
  /** When provided (e.g. fed by a host channel), the island renders this page instead of fetching. */
  members?: MemberPage;
  onCount?: (count: number) => void;
  onPage?: (page: number) => void;
  onSelected?: (row: MemberRow) => void;
  onOpen?: (id: string) => void;
}

type Status = 'idle' | 'loading' | 'forbidden' | 'error';

interface Page {
  rows: MemberRow[];
  first: number;
  perPage: number;
  size: number;
}

const EMPTY_PAGE: Page = { rows: [], first: 0, perPage: 20, size: 0 };

function toPage(m: MemberPage): Page {
  return {
    rows: (m.list as MemberRow[]) ?? [],
    first: Number(m.first) || 0,
    perPage: Number(m.perPage) || 20,
    size: Number(m.size) || 0,
  };
}

function rowId(row: MemberRow): string | undefined {
  return firstString(row, ['id', '_id', 'encryptedId']);
}

function fmtDate(row: MemberRow): string {
  const v = row['_updated'] ?? row['updated'] ?? row['dateUpdated'];
  const d = typeof v === 'number' ? new Date(v) : typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PlanPill({ row }: { row: MemberRow }) {
  const plan = String(row['plan'] ?? '');
  if (!plan) return <span className="gm-pill gm-pill--none">—</span>;
  if (plan === 'premium') return <span className="gm-pill gm-pill--premium" title="Premium plan">Premium</span>;
  return <span className="gm-pill gm-pill--standard" title="Standard plan">Standard</span>;
}

/**
 * The results island. Two modes:
 *  - self-fetch: calls MemberService.search by `criteria` (standalone / independent use);
 *  - data-in: when `members` is provided (fed by a host channel), it renders that page and does not
 *    fetch, so the host's own search owns the data and there is a single fetch.
 */
export function MemberResults({ criteria, members, onCount, onPage, onSelected, onOpen }: MemberResultsProps) {
  const dataIn = members != null;
  const [page, setPage] = useState(0);
  const [fetched, setFetched] = useState<Page>(EMPTY_PAGE);
  const [status, setStatus] = useState<Status>(dataIn ? 'idle' : 'loading');
  const [selected, setSelected] = useState<string | undefined>();
  const seq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const criteriaJson = JSON.stringify(criteria ?? {});

  useEffect(() => {
    if (!dataIn) setPage(0);
  }, [criteriaJson, dataIn]);

  useEffect(() => {
    if (dataIn) return; // a channel feeds us; don't fetch
    const mine = ++seq.current;
    setStatus('loading');
    MemberService.search(page, (criteria ?? {}) as Record<string, unknown>)
      .then((res) => {
        if (mine !== seq.current) return;
        const next = toPage(res as MemberPage);
        setFetched(next);
        setStatus('idle');
        onCount?.(next.size);
      })
      .catch((err) => {
        if (mine !== seq.current) return;
        if (err instanceof MotuError && err.status === 403) setStatus('forbidden');
        else setStatus('error');
      });
  }, [criteriaJson, page, dataIn]);

  const view = dataIn ? toPage(members as MemberPage) : fetched;
  const effectiveStatus: Status = dataIn ? 'idle' : status;
  const perPage = view.perPage || 20;
  const currentPage = dataIn ? Math.floor(view.first / perPage) : page;
  const totalPages = Math.max(1, Math.ceil(view.size / perPage));
  const canPrev = currentPage > 0;
  const canNext = currentPage + 1 < totalPages;

  // In data-in mode paging is owned by the host: emit an intent the host translates to its own paging.
  const goPrev = () =>
    dataIn ? onPage?.(currentPage - 1) : setPage((p) => Math.max(0, p - 1));
  const goNext = () => (dataIn ? onPage?.(currentPage + 1) : setPage((p) => p + 1));

  const open = (row: MemberRow) => {
    const id = rowId(row);
    setSelected(id);
    onSelected?.(row);
    if (id) onOpen?.(id);
  };

  // Auto-fit: when the host opts in (--gm-scroll-fit, set by the legacy skin and the embedded
  // preview), size the list to fill from wherever it actually starts down to the viewport bottom, so
  // it never overflows the legacy fixed layout — no magic offset. Standalone leaves it unset (grows).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!getComputedStyle(el).getPropertyValue('--gm-scroll-fit').trim()) {
      el.style.maxHeight = '';
      return;
    }
    const RESERVE = 40; // footer + breathing room below the list
    const fit = () => {
      const top = el.getBoundingClientRect().top;
      el.style.maxHeight = `${Math.max(160, window.innerHeight - top - RESERVE)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [effectiveStatus, view.rows.length]);

  return (
    <div className="gm-panel">
      <div className="gm-panel__head">
        <h2>Members</h2>
        <span className="gm-sub">{effectiveStatus === 'idle' ? `${view.size} total` : ' '}</span>
      </div>
      <div className="gm-panel__body">
        <div className="gm-toolbar">
          <span className="gm-count">
            {effectiveStatus === 'idle' && (
              <>
                Showing <b>{view.rows.length}</b> of <b>{view.size}</b>
              </>
            )}
          </span>
          <div className="gm-pager">
            <button type="button" className="gm-btn" disabled={!canPrev} onClick={goPrev}>
              ‹ Prev
            </button>
            <span className="gm-pager__info">
              Page {currentPage + 1} / {totalPages}
            </span>
            <button type="button" className="gm-btn" disabled={!canNext} onClick={goNext}>
              Next ›
            </button>
          </div>
        </div>

        {effectiveStatus === 'forbidden' && (
          <div className="gm-state">
            <strong>No access</strong>
            You don't have permission to view members.
          </div>
        )}
        {effectiveStatus === 'error' && (
          <div className="gm-state">
            <strong>Something went wrong</strong>
            Please try again.
          </div>
        )}

        {effectiveStatus !== 'forbidden' && effectiveStatus !== 'error' && (
          <div className="gm-scroll" ref={scrollRef}>
            <table className="gm-table">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Plan</th>
                  <th style={{ width: '28%' }}>Email</th>
                  <th style={{ width: '16%' }}>Last name</th>
                  <th style={{ width: '15%' }}>First name</th>
                  <th style={{ width: '14%' }}>Joined</th>
                  <th style={{ width: '15%' }}>Chapter</th>
                </tr>
              </thead>
              <tbody>
                {effectiveStatus === 'loading' &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`s${i}`} className="gm-skel-row">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}>
                          <div className="gm-skel" style={{ width: `${60 + ((i + j) % 4) * 10}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))}

                {effectiveStatus === 'idle' && view.rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="gm-state">
                        <strong>No members found</strong>
                        Try adjusting your filters.
                      </div>
                    </td>
                  </tr>
                )}

                {effectiveStatus === 'idle' &&
                  view.rows.map((row, i) => {
                    const id = rowId(row);
                    return (
                      <tr
                        key={id ?? i}
                        className={id && id === selected ? 'is-selected' : undefined}
                        onClick={() => open(row)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            open(row);
                          }
                        }}
                      >
                        <td>
                          <PlanPill row={row} />
                        </td>
                        <td className="gm-primary-cell" title={firstString(row, ['email'])}>
                          {firstString(row, ['email']) ?? '—'}
                          {row['status'] === 'suspended' && <span className="gm-tag">suspended</span>}
                        </td>
                        <td>{firstString(row, ['surname']) ?? '—'}</td>
                        <td>{firstString(row, ['firstname']) ?? '—'}</td>
                        <td className="gm-muted">{fmtDate(row)}</td>
                        <td className="gm-muted" title={firstString(row, ['coordinator'])}>
                          {firstString(row, ['coordinator']) ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
