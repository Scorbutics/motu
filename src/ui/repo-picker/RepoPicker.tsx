import type { RepoSummary } from "@/lib/host"

/**
 * Which project is being reviewed.
 *
 * Renders from defaults alone: no repos is the state this opens in before the host has answered, and
 * it is a sentence rather than an empty box — a picker with nothing in it looks broken otherwise.
 */
export function RepoPicker({
  repos = [],
  value = null,
  onRepoSelected,
}: {
  repos?: RepoSummary[]
  value?: string | null
  onRepoSelected?: (repo: string) => void
}) {
  if (!repos.length) {
    return (
      <div className="rp-empty">
        No project has published a baseline yet — run <code>motu island snapshot --all --remote</code>.
      </div>
    )
  }
  return (
    <ul className="rp-list">
      {repos.map((r) => (
        <li key={r.repo}>
          <button
            type="button"
            className="rp-item"
            aria-current={r.repo === value}
            onClick={() => onRepoSelected?.(r.repo)}
          >
            <b>{r.repo}</b>
            <small>
              {r.slugs.length} lagoon{r.slugs.length === 1 ? "" : "s"} · {r.records} record
              {r.records === 1 ? "" : "s"}
            </small>
          </button>
        </li>
      ))}
    </ul>
  )
}
