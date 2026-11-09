// Small pieces the two chapter pages share. Page code, not islands: these pages are plain React.
const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Wed 11 Nov". */
export function DateLabel({ iso, withTime = false }: { iso: string; withTime?: boolean }) {
  const d = new Date(iso);
  return <time dateTime={iso}>{withTime ? `${DATE.format(d)} · ${TIME.format(d)}` : DATE.format(d)}</time>;
}

export function MembersIcon() {
  return (
    <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FBF3E2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}
