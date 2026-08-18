export interface MemberHeaderProps {
  heading?: string;
  subtitle?: string;
  /** Optional pill on the right — the standalone preview uses it to mark the harness. */
  badge?: string;
}

/**
 * The page header ("hero"). In the motu skin it renders a vibrant gradient banner; in the legacy
 * skin it collapses to a plain title/subtitle that matches the host's own page heading.
 */
export function MemberHeader({
  heading = 'Members',
  subtitle = 'Browse and add community members',
  badge,
}: MemberHeaderProps) {
  return (
    <header className="gm-hero">
      <span className="gm-hero__icon" aria-hidden="true">
        ◎
      </span>
      <div className="gm-hero__text">
        <h1 className="gm-hero__title">{heading}</h1>
        {subtitle ? <p className="gm-hero__sub">{subtitle}</p> : null}
      </div>
      {badge ? <span className="gm-hero__badge">{badge}</span> : null}
    </header>
  );
}
