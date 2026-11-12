"use client"
import { Button, Panel } from "@motu/chrome/react"

/**
 * THE TOKEN, ONCE (C3, C4). It is only ever in the create answer: rows carry no token, so once this is
 * dismissed nothing on the page — and nothing in the database — can show it again. Saying so here is
 * the point, at the moment somebody decides whether to copy it.
 */
export function ShareTokenReveal({
  revealedToken = null,
  onTokenDismissed,
}: {
  revealedToken?: string | null
  onTokenDismissed?: () => void
}) {
  if (!revealedToken) return null
  return (
    <Panel>
      <div style={{ display: "grid", gap: 8, padding: 12 }}>
        <strong>Copy this link&apos;s token now — it will not be shown again.</strong>
        <code style={{ fontSize: 14, wordBreak: "break-all" }}>{revealedToken}</code>
        <div style={{ display: "flex", gap: 8 }}>
          <Button weight="quiet" onClick={() => void navigator.clipboard?.writeText(revealedToken)}>Copy</Button>
          <Button weight="strong" onClick={() => onTokenDismissed?.()}>I have copied it</Button>
        </div>
      </div>
    </Panel>
  )
}
