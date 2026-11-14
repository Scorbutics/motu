import { useEffect, useRef, useState } from 'react';
import { MemberService } from '@motujs/contract';
import { MotuError } from '@motujs/runtime';
import {
  DEFAULT_ORDER,
  firstString,
  type MemberCriteria,
  type MemberOrder,
  type MemberPage,
  type MemberRow,
  type MemberSortKey,
} from '../../shared/member-types.js';
import { ddmmyyyy } from '../../shared/member-draft.js';
import { memberStats, todayIso } from '../../shared/gamification.js';
import { chapterColor, GemIcon, HotFlame, initials, WarmFlame } from '../club/club-bits.js';

export interface MemberResultsProps {
  criteria?: MemberCriteria;
  /** When provided (e.g. fed by a host channel), the island renders this page instead of fetching. */
  members?: MemberPage;
  /** The day the game columns are computed for (`YYYY-MM-DD`). Absent means today. */
  asOf?: string;
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

/**
 * The date under the "Joined" column — which is the column it is under.
 *
 * IT USED TO READ `updated`, WITH THE HEADER STILL SAYING "JOINED", and it formats through the app's
 * own formatter rather than `toLocaleDateString`, which rendered month-first beside the card's
 * day-first. One date, one function, one order.
 */
function fmtDate(row: MemberRow): string {
  const v = firstString(row, ['joined', 'dateJoined']);
  return v ? ddmmyyyy(v) : '—';
}

function PlanPill({ row }: { row: MemberRow }) {
  if (row['plan'] === 'premium') {
    return (
      <span className="cl-lg cl-pill cl-pill--premium">
        <GemIcon />
        Premium
      </span>
    );
  }
  if (row['plan'] === 'standard') return <span className="cl-lg cl-pill cl-pill--standard">Standard</span>;
  return <span style={{ color: 'var(--cl-muted)' }}>—</span>;
}

/**
 * The page numbers the pager shows: the first, the last, and the current one with its neighbours,
 * with `null` where a run is skipped — "1 2 3 … 12".
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  const keep = new Set([0, total - 1, current - 1, current, current + 1]);
  if (current <= 1) keep.add(2);
  if (current >= total - 2) keep.add(total - 3);
  const pages = [...keep].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

const SORTABLE: [MemberSortKey, string][] = [
  ['plan', 'Plan'],
  ['level', 'Level'],
  ['streak', 'Streak'],
  ['chapter', 'Chapter'],
  ['joined', 'Joined'],
];

/** The selected members as a CSV a spreadsheet opens: the columns the table shows, and the game's. */
function toCsv(rows: MemberRow[], asOf: string): string {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['First name', 'Last name', 'Email', 'Plan', 'Status', 'Chapter', 'Joined', 'Level', 'XP', 'Streak (days)'];
  const lines = rows.map((r) => {
    const s = memberStats(r, asOf);
    return [r.firstname, r.surname, r.email, r.plan, r.status, r.chapter, r.joined, s.level, s.xp, s.streak].map(cell).join(',');
  });
  return [head.map(cell).join(','), ...lines].join('\r\n');
}

function download(name: string, text: string) {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The ⋯ menu at the end of a row: the two things a person does with one member. */
function RowMenu({ row, name, onOpen }: { row: MemberRow; name: string; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const email = firstString(row, ['email']);
  return (
    <div className="cl-more" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="cl-btn cl-more__btn" aria-label={`Actions for ${name}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open ? (
        <div className="cl-more__menu" role="menu" aria-label={`Actions for ${name}`}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpen(); }}>
            View profile
          </button>
          {email ? (
            <a role="menuitem" href={`mailto:${email}`} onClick={() => setOpen(false)}>
              Send an email
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The members table. Two modes:
 *  - self-fetch: calls MemberService.search by `criteria` (standalone / independent use);
 *  - data-in: when `members` is provided (fed by a host channel), it renders that page and does not
 *    fetch, so the host's own search owns the data and there is a single fetch.
 *
 * THE GAME COLUMNS ARE COMPUTED HERE, from each row and `asOf`, by the club's own rules
 * (`gamification.ts`). The backend knows nothing of levels or streaks; the row and the date are all
 * the rules need, so the table and the podium beside it cannot disagree about a member.
 *
 * SORTING ASKS THE BACKEND. A header click changes the ORDER the search is made in — the port sorts
 * the whole result, level and streak included — so "Level ▼" puts the club's highest level on page
 * one, not the highest level that happened to be on screen.
 *
 * SELECTION IS THE ISLAND'S OWN. Ticked members are kept across pages and searches until cleared;
 * nothing else on the page reads them, so they are not region state. The bulk bar acts on them:
 * Message opens one email to all of them, Export downloads them as a CSV. Change plan has no backend
 * to write to, and says so.
 *
 * At phone width the table keeps its columns and scrolls sideways inside its card, the member column
 * pinned — a level bar and a streak are only legible beside the name they belong to.
 */
export function MemberResults({ criteria, members, asOf, onCount, onPage, onSelected, onOpen }: MemberResultsProps) {
  const dataIn = members != null;
  const [page, setPage] = useState(0);
  const [order, setOrder] = useState<MemberOrder>(DEFAULT_ORDER);
  const [fetched, setFetched] = useState<Page>(EMPTY_PAGE);
  const [status, setStatus] = useState<Status>(dataIn ? 'idle' : 'loading');
  const [selected, setSelected] = useState<Map<string, MemberRow>>(() => new Map());
  const seq = useRef(0);
  const criteriaJson = JSON.stringify(criteria ?? {});
  const day = asOf || todayIso();
  const orderJson = JSON.stringify(order);

  useEffect(() => {
    if (!dataIn) setPage(0);
  }, [criteriaJson, orderJson, dataIn]);

  useEffect(() => {
    if (dataIn) return; // a channel feeds us; don't fetch
    const mine = ++seq.current;
    setStatus('loading');
    MemberService.search(page, { ...(criteria ?? {}), order: { ...order, asOf: day } } as Record<string, unknown>)
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
  }, [criteriaJson, orderJson, page, dataIn, day]);

  const view = dataIn ? toPage(members as MemberPage) : fetched;
  const effectiveStatus: Status = dataIn ? 'idle' : status;
  const perPage = view.perPage || 20;
  const currentPage = dataIn ? Math.floor(view.first / perPage) : page;
  const totalPages = Math.max(1, Math.ceil(view.size / perPage));
  const go = (p: number) => {
    if (p < 0 || p >= totalPages || p === currentPage) return;
    if (dataIn) onPage?.(p);
    else setPage(p);
  };

  const sortBy = (key: MemberSortKey) =>
    setOrder((o) => (o.key === key ? { key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'level' || key === 'streak' ? 'desc' : 'asc' }));
  const arrow = (key: MemberSortKey) => (order.key === key ? (order.dir === 'asc' ? '▲' : '▼') : '');
  const ariaSort = (key: MemberSortKey) => (order.key === key ? (order.dir === 'asc' ? 'ascending' : 'descending') : undefined);

  const open = (row: MemberRow) => {
    onSelected?.(row);
    const id = rowId(row);
    if (id) onOpen?.(id);
  };

  const shown = effectiveStatus === 'idle' ? view.rows : [];
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(rowId(r) ?? ''));
  const toggle = (row: MemberRow) =>
    setSelected((prev) => {
      const next = new Map(prev);
      const id = rowId(row) ?? '';
      if (next.has(id)) next.delete(id);
      else next.set(id, row);
      return next;
    });
  const toggleShown = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of shown) {
        const id = rowId(r) ?? '';
        if (allShownSelected) next.delete(id);
        else next.set(id, r);
      }
      return next;
    });
  const picked = [...selected.values()];
  const emails = picked.map((r) => firstString(r, ['email'])).filter(Boolean) as string[];

  const failed = effectiveStatus === 'forbidden' || effectiveStatus === 'error';
  const searched = criteria?.q?.trim();

  return (
    <div className="cl-results cl-text">
      {picked.length > 0 ? (
        <div className="cl-bulk" role="region" aria-label="Bulk actions">
          <strong>{picked.length} selected</strong>
          <a className="cl-btn cl-lg cl-bulk__btn" href={`mailto:?bcc=${emails.map(encodeURIComponent).join(',')}`} style={{ textDecoration: 'none' }}>
            Message
          </a>
          <button type="button" className="cl-btn cl-lg cl-bulk__btn" disabled title="Plans cannot be changed in this demo: there is no backend to write to">
            Change plan
          </button>
          <button type="button" className="cl-btn cl-lg cl-bulk__btn" onClick={() => download(`members-${day}.csv`, toCsv(picked, day))}>
            Export
          </button>
          <button type="button" className="cl-btn cl-lg cl-bulk__btn cl-bulk__clear" onClick={() => setSelected(new Map())}>
            Clear
          </button>
        </div>
      ) : null}

      <div className="cl-table">
        <div className="cl-table__inner" role="table" aria-label="Members" aria-rowcount={view.size + 1}>
          <div className="cl-lg cl-grid cl-table__head" role="row">
            <div className="cl-sticky" role="columnheader" aria-sort={ariaSort('name')}>
              <input type="checkbox" className="cl-check" checked={allShownSelected} onChange={toggleShown} aria-label="Select all shown members" disabled={shown.length === 0} />
              <button type="button" className="cl-hd" onClick={() => sortBy('name')}>
                Member <span aria-hidden="true">{arrow('name')}</span>
              </button>
            </div>
            {SORTABLE.map(([key, label]) => (
              <div key={key} role="columnheader" aria-sort={ariaSort(key)}>
                <button type="button" className="cl-hd" onClick={() => sortBy(key)}>
                  {label} <span aria-hidden="true">{arrow(key)}</span>
                </button>
              </div>
            ))}
            <span className="cl-sr" role="columnheader">
              Actions
            </span>
          </div>

          {effectiveStatus === 'forbidden' && (
            <div className="cl-state">
              <strong>No access</strong>
              You don't have permission to view members.
            </div>
          )}
          {effectiveStatus === 'error' && (
            <div className="cl-state">
              <strong>Something went wrong</strong>
              Please try again.
            </div>
          )}

          {effectiveStatus === 'loading' &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={`s${i}`} className={`cl-grid cl-row${i % 2 ? ' cl-row--odd' : ''}`} aria-hidden="true" style={{ cursor: 'default' }}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <div key={j} className="cl-skel" style={{ width: `${55 + ((i + j) % 4) * 12}%` }} />
                ))}
                <span />
              </div>
            ))}

          {effectiveStatus === 'idle' && view.rows.length === 0 && (
            <div className="cl-state">
              <strong>No members found</strong>
              {searched ? `No members match “${searched}”.` : 'Try adjusting your filters.'}
            </div>
          )}

          {shown.map((row, i) => {
            const id = rowId(row) ?? String(i);
            const first = firstString(row, ['firstname']) ?? '';
            const last = firstString(row, ['surname']) ?? '';
            const name = [first, last].filter(Boolean).join(' ') || firstString(row, ['email']) || '—';
            const stats = memberStats(row, day);
            const email = firstString(row, ['email']);
            const chapter = firstString(row, ['chapter', 'coordinator']);
            return (
              // The whole row opens the member for a pointer; the NAME is the button a keyboard and a
              // screen reader reach — a row cannot be a button and also hold a checkbox and a link.
              <div key={id} role="row" className={`cl-grid cl-row${i % 2 ? ' cl-row--odd' : ''}`} onClick={() => open(row)}>
                <div className="cl-sticky" role="cell">
                  <input
                    type="checkbox"
                    className="cl-check"
                    checked={selected.has(id)}
                    onChange={() => toggle(row)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${name}`}
                  />
                  <span className="cl-ava" aria-hidden="true">
                    {initials(first, last)}
                  </span>
                  <span className="cl-who">
                    {/* THE TAG BESIDE THE NAME, not after the email: the email is the line that gets
                        cut with an ellipsis, and the tag went with it — never visible at desktop width. */}
                    <span className="cl-who__line">
                      <button
                        type="button"
                        className="cl-who__name"
                        title={name}
                        onClick={(e) => {
                          e.stopPropagation();
                          open(row);
                        }}
                      >
                        {first} <strong>{last}</strong>
                      </button>
                      {row['status'] === 'suspended' ? <span className="cl-who__sus">Suspended</span> : null}
                    </span>
                    {email ? (
                      <a className="cl-who__mail" href={`mailto:${email}`} title={email} onClick={(e) => e.stopPropagation()}>
                        {email}
                      </a>
                    ) : null}
                  </span>
                </div>
                <div role="cell">
                  <PlanPill row={row} />
                </div>
                <div className="cl-level" role="cell">
                  <span className="cl-lg">Lv {stats.level}</span>
                  <div className="cl-bar" title={`${stats.progress}% to next level`} role="progressbar" aria-label={`Level ${stats.level}, ${stats.progress}% to level ${stats.level + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.progress}>
                    <span style={{ width: `${stats.progress}%` }} />
                  </div>
                </div>
                <div
                  className="cl-streak"
                  role="cell"
                  style={{ fontWeight: stats.hot ? 'bold' : 'normal', color: stats.streak > 0 ? 'var(--cl-ink)' : 'var(--cl-muted)' }}
                >
                  {stats.hot ? <HotFlame /> : stats.streak > 0 ? <WarmFlame /> : null}
                  {stats.streak > 0 ? `${stats.streak} day${stats.streak === 1 ? '' : 's'}` : '—'}
                </div>
                <div className="cl-chap" role="cell">
                  <span className="cl-chap__dot" aria-hidden="true" style={{ background: chapterColor(chapter) }} />
                  <span className="cl-chap__name" title={chapter}>
                    {chapter ?? '—'}
                  </span>
                </div>
                <span className="cl-date" role="cell">
                  {fmtDate(row)}
                </span>
                <div role="cell">
                  <RowMenu row={row} name={name} onOpen={() => open(row)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!failed && (
        <nav className="cl-pages" aria-label="Pagination">
          <span>
            {effectiveStatus === 'idle' ? (
              <>
                Showing{' '}
                <strong>
                  {view.rows.length ? `${view.first + 1}–${view.first + view.rows.length}` : '0'}
                </strong>{' '}
                of <strong>{view.size}</strong>
              </>
            ) : (
              'Loading the directory…'
            )}
          </span>
          {totalPages > 1 && (
            <div className="cl-pages__nav">
              <button type="button" className="cl-pages__step" disabled={currentPage === 0} onClick={() => go(currentPage - 1)}>
                ‹ Prev
              </button>
              {pageWindow(currentPage, totalPages).map((p, i) =>
                p === null ? (
                  <span key={`gap${i}`} className="cl-pages__gap" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className="cl-pages__n"
                    aria-current={p === currentPage ? 'page' : undefined}
                    aria-label={`Page ${p + 1}`}
                    onClick={() => go(p)}
                  >
                    {p + 1}
                  </button>
                ),
              )}
              <button type="button" className="cl-pages__step" disabled={currentPage + 1 >= totalPages} onClick={() => go(currentPage + 1)}>
                Next ›
              </button>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
