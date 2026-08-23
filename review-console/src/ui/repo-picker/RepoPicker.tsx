import type { RepoSummary, Shot } from "@/lib/host"

/**
 * Which project is being reviewed.
 *
 * Renders from defaults alone: no repos is the state this opens in before the host has answered, and
 * it is a sentence rather than an empty box — a picker with nothing in it looks broken otherwise.
 *
 * THE WATER IS A READOUT, not decoration — the same rule the lagoon's own chrome follows. The gauge
 * down the left of each row is depth: faint for a project sitting still, full and lit for the one you
 * are reviewing. The counts are pills because they are FACTS about a project, and a fact you can read
 * without leaning in is worth more than one set in muted 11px grey.
 */
export function RepoPicker({
  repos = [],
  value = null,
  shots = [],
  onRepoSelected,
}: {
  repos?: RepoSummary[]
  value?: string | null
  /** The SELECTED repo's shots — the only one whose statuses the host has loaded. */
  shots?: Shot[]
  onRepoSelected?: (repo: string) => void
}) {
  if (!repos.length) {
    return (
      <div className="rp-empty">
        No project has published a baseline yet — run <code>motu island snapshot --all --remote</code>.
      </div>
    )
  }
  // Only the selected repo has shots in the region, so only it can show a pending count. Showing an
  // invented one for the others would be a number that means nothing, on the row you trust most.
  const pending = shots.filter((s) => s.status !== "match").length

  return (
    <ul className="rp-list">
      {repos.map((r, i) => {
        const current = r.repo === value
        const [owner, name] = r.repo.includes("/") ? [r.repo.slice(0, r.repo.indexOf("/")), r.repo.slice(r.repo.indexOf("/") + 1)] : ["", r.repo]
        return (
          <li key={r.repo} style={{ ["--i" as string]: String(i) }}>
            <button type="button" className="rp-item" aria-current={current} onClick={() => onRepoSelected?.(r.repo)}>
              <span className="rp-gauge" aria-hidden="true" />
              <span className="rp-body">
                <b>
                  {owner && <span className="rp-owner">{owner}/</span>}
                  {name}
                </b>
                <span className="rp-stats">
                  <em className="rp-pill">
                    {r.slugs.length} lagoon{r.slugs.length === 1 ? "" : "s"}
                  </em>
                  <em className="rp-pill">
                    {r.records} record{r.records === 1 ? "" : "s"}
                  </em>
                  {current && pending > 0 && <em className="rp-pill is-pending">{pending} to review</em>}
                  {current && shots.length > 0 && pending === 0 && <em className="rp-pill is-settled">all settled</em>}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
