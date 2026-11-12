"use client"
import { useState } from "react"
import { Button, Empty, Grow, List, ListItem, Pill, Row, Sub, Trail } from "@motu/chrome/react"
import type { MotuTone } from "@motu/chrome/react"
import { isLive } from "@/src/auth/share-link-rules"
import type { ShareLinkRow } from "@/src/share/share-links-source"

export type ShareStatus = "live" | "expired" | "revoked"

/** The app's own rule (isLive), read in the order it states: revocation beats expiry (S1). */
export function statusOf(row: ShareLinkRow, nowIso: string): ShareStatus {
  if (row.revokedAt !== null) return "revoked"
  const live = isLive(
    { projectId: "", sha: row.sha, slug: row.slug, expiresAt: row.expiresAt ? new Date(row.expiresAt) : null, revokedAt: null },
    new Date(nowIso),
  )
  return live ? "live" : "expired"
}

const TONE: Record<ShareStatus, MotuTone> = { live: "ok", expired: "neutral", revoked: "broken" }
const LABEL: Record<ShareStatus, string> = { live: "Live", expired: "Expired", revoked: "Revoked" }
const day = (iso: string) => new Date(iso).toISOString().slice(0, 10)

/**
 * The project's share links: what each opens, whether it still opens, and the way to turn one off.
 *
 * Revoking ASKS FIRST (R1): the confirmation is this island's own state — nothing outside it needs to
 * know a question is open — and only the confirmed answer leaves it, as the `revoke-requested` intent.
 * A revoked link offers no Revoke (R3).
 */
export function ShareLinkList({
  links = [],
  now = new Date(0).toISOString(),
  busy = false,
  error = null,
  onRevokeRequested,
}: {
  links?: ShareLinkRow[]
  now?: string
  busy?: boolean
  error?: string | null
  onRevokeRequested?: (id: string) => void
}) {
  const [asking, setAsking] = useState<string | null>(null)
  return (
    <div>
      {error ? <p role="alert" style={{ margin: "8px 12px", color: "var(--motu-broken, #b42318)" }}>{error}</p> : null}
      {links.length === 0 ? (
        <Empty>No share links yet.</Empty>
      ) : (
        <List>
          {links.map((link, k) => {
            const status = statusOf(link, now)
            const whole = link.sha === null && link.slug === null
            return (
              <ListItem key={link.id} index={k}>
                <Row>
                  <Grow>
                    <div>
                      {link.sha ? <>commit <code>{link.sha}</code></> : "every commit"}
                      {" · "}
                      {link.slug ? <>page <code>{link.slug}</code></> : "every page"}
                      {whole ? <> {" "}<Pill tone="warn" size="micro">whole project</Pill></> : null}
                    </div>
                    <Sub>
                      created {day(link.createdAt)}
                      {/* Expiry is shown for every row — a revoked link that had ALREADY expired is a
                          different fact from one turned off while live (share-links.ts) — and in the
                          right tense: a past date has expired, it does not "expire". */}
                      {link.expiresAt ? (Date.parse(link.expiresAt) <= Date.parse(now) ? ` · expired ${day(link.expiresAt)}` : ` · expires ${day(link.expiresAt)}`) : " · never expires"}
                      {link.revokedAt ? ` · revoked ${day(link.revokedAt)}` : ""}
                    </Sub>
                  </Grow>
                  <Trail>
                    <Pill tone={TONE[status]}>{LABEL[status]}</Pill>
                    {status !== "revoked" && asking !== link.id ? (
                      <Button weight="quiet" disabled={busy} onClick={() => setAsking(link.id)}>Revoke link</Button>
                    ) : null}
                  </Trail>
                </Row>
                {asking === link.id ? (
                  <Row>
                    {/* TRUE IN BOTH CASES: an expired link already opens nothing, and revoking a live
                        one stops THE LINK — a holder with their own access keeps it (authorize.ts). */}
                    <Grow>{status === "expired" ? "Revoke this expired link? It already opens nothing; revoking records that it was turned off." : "Revoke this link? It stops opening anything at once."}</Grow>
                    <Trail>
                      <Button weight="strong" tone="broken" disabled={busy} onClick={() => { setAsking(null); onRevokeRequested?.(link.id) }}>Revoke</Button>
                      <Button weight="quiet" onClick={() => setAsking(null)}>Cancel</Button>
                    </Trail>
                  </Row>
                ) : null}
              </ListItem>
            )
          })}
        </List>
      )}
    </div>
  )
}
