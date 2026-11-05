// The club design's recurring pieces, drawn once: chapter colours, flames, icons, number formatting.
//
// Several islands draw the same things — a chapter's colour in the table and in the Cup, a flame in
// the table and on a tile — and two copies of "which colour is North" would put North in navy on one
// and teal on the other.

/**
 * Each chapter's colour, for its square in the table and its bar in the Cup. The seven the design
 * names keep its colours; University, which the design never met, gets one of its own.
 */
export const CHAPTER_COLORS: Record<string, string> = {
  'North chapter': '#3A4670',
  'West chapter': '#66713F',
  'East chapter': '#74506F',
  'Harbour chapter': '#4F6E7D',
  'South chapter': '#7E5F42',
  'Old town chapter': '#6A5A80',
  'Northwest coastal chapter': '#4F7262',
  'University chapter': '#8E3F5C',
};

/**
 * THE CLUB'S NAME, said once. The sidebar's badge and the membership card both print it, and a name
 * written twice is a name that ends up spelled two ways.
 */
export const CLUB_NAME = "The Motu's club";

export function chapterColor(chapter: string | undefined): string {
  return (chapter && CHAPTER_COLORS[chapter]) || '#5C564C';
}

export function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '·';
}

const FLAME = 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5.2.2 1.8 1 2.9 2.2 3.4C11 8.5 11 5 12 2z';

/** A streak of two weeks or more: a burning, flickering flame that says so to a screen reader. */
export function HotFlame({ size = 16 }: { size?: number }) {
  return (
    <svg className="cl-flame" role="img" aria-label="On fire" width={size} height={size} viewBox="0 0 24 24">
      <path d={FLAME} fill="#C9563F" />
    </svg>
  );
}

/** A streak under two weeks: the flame's outline. */
export function WarmFlame({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--cl-muted)" strokeWidth="2" strokeLinejoin="round">
      <path d={FLAME} />
    </svg>
  );
}

/** The streaks tile's flame. */
export function TileFlame() {
  return (
    <svg className="cl-flame" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24">
      <path d={FLAME} fill="#F0DDB0" />
    </svg>
  );
}

export function PeopleIcon({ size = 28, stroke = 'currentColor', width = 2.2 }: { size?: number; stroke?: string; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M17 14.5c2.4.2 4 1.8 4.5 4.5" />
    </svg>
  );
}

export function GemIcon({ size = 11 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 3h12l4 6-10 12L2 9z" />
    </svg>
  );
}

export function CrownIcon() {
  return (
    <svg aria-hidden="true" width="24" height="16" viewBox="0 0 28 20">
      <path d="M2 18L4 4l6 6 4-8 4 8 6-6 2 14z" fill="var(--cl-gold)" stroke="#8E743A" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** "8,940" — the design's thousands separator, whatever the reader's locale. */
export const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
