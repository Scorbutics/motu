import { Empty, Gauge, Grow, List, ListItem, Pill, Row } from "@motu/chrome/react"
import type { RepoSummary, Shot } from "@/src/review/host"

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
 *
 * ALL FOUR OF THOSE SHAPES ARE THE KIT'S NOW. The gauge, the staggered entrance, the card row and the
 * pill were written here from literals that happened to equal motu's tokens — and the seam lens had
 * grown the same four independently. `--line` had already drifted to .14 against the framework's .12
 * once; the way that stops happening again is for there to be nothing here to drift.
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
      <Empty className="rp-empty">
        No project has published a baseline yet — run <code>motu island snapshot --all --remote</code>.
      </Empty>
    )
  }
  // Only the selected repo has shots in the region, so only it can show a pending count. Showing an
  // invented one for the others would be a number that means nothing, on the row you trust most.
  const pending = shots.filter((s) => s.status !== "match").length

  return (
    <List className="rp-list">
      {repos.map((r, i) => {
        const current = r.repo === value
        const cut = r.repo.indexOf("/")
        const [owner, name] = cut >= 0 ? [r.repo.slice(0, cut), r.repo.slice(cut + 1)] : ["", r.repo]
        return (
          <ListItem key={r.repo} index={i}>
            <Row as="button" surface="card" current={current} className="rp-item" onClick={() => onRepoSelected?.(r.repo)}>
              <Gauge />
              <Grow className="rp-body">
                <b>
                  {owner && <span className="rp-owner">{owner}/</span>}
                  {name}
                </b>
                <span className="rp-stats">
                  <Pill>
                    {r.slugs.length} lagoon{r.slugs.length === 1 ? "" : "s"}
                  </Pill>
                  <Pill>
                    {r.records} record{r.records === 1 ? "" : "s"}
                  </Pill>
                  {/* The two that are a VERDICT rather than a count, in the kit's own tones — which
                      are the colours this console already used under the names `--changed` and
                      `--new`. */}
                  {current && pending > 0 && <Pill tone="warn">{pending} to review</Pill>}
                  {current && shots.length > 0 && pending === 0 && <Pill tone="ok">all settled</Pill>}
                </span>
              </Grow>
            </Row>
          </ListItem>
        )
      })}
    </List>
  )
}
