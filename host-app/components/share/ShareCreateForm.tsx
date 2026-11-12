"use client"
import { useState } from "react"
import { Button } from "@motu/chrome/react"
import { EXPIRIES, type CreateRequest, type Expiry } from "@/src/share/share-links-source"

const EXPIRY_LABEL: Record<Expiry, string> = { "1d": "1 day", "7d": "7 days", "30d": "30 days", never: "Never" }
const ALL = ""

/**
 * A new link: which commit (or all), which page (or all), and how long it lives (C1).
 *
 * NEVER IS A DECISION (C2), the same one `infra/mint-share-link.mjs` makes you type out: choosing it
 * shows a confirmation, and Create link stays disabled until it is ticked.
 */
export function ShareCreateForm({
  commits = [],
  pages = [],
  busy = false,
  onCreateRequested,
}: {
  commits?: string[]
  pages?: string[]
  busy?: boolean
  onCreateRequested?: (req: CreateRequest) => void
}) {
  const [sha, setSha] = useState(ALL)
  const [slug, setSlug] = useState(ALL)
  const [expiry, setExpiry] = useState<Expiry>("7d")
  const [neverConfirmed, setNeverConfirmed] = useState(false)
  const blocked = busy || (expiry === "never" && !neverConfirmed)
  const field = { display: "grid", gap: 4 } as const
  return (
    <form
      aria-busy={busy}
      style={{ display: "grid", gap: 12, padding: 12 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (blocked) return
        onCreateRequested?.({ sha: sha || null, slug: slug || null, expiry })
        // NEVER IS DECIDED ONCE PER LINK: the form does not stay armed for a second permanent one (C2).
        if (expiry === "never") { setExpiry("7d"); setNeverConfirmed(false) }
      }}
    >
      {/* While a request is in flight the form it came from is not editable. */}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
      <label style={field}>
        Commit
        <select value={sha} onChange={(e) => setSha(e.target.value)}>
          <option value={ALL}>All commits</option>
          {commits.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label style={field}>
        Page
        <select value={slug} onChange={(e) => setSlug(e.target.value)}>
          <option value={ALL}>All pages</option>
          {pages.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 4 }}>
        <legend>Expires after</legend>
        {EXPIRIES.map((x) => (
          <label key={x} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" name="expiry" checked={expiry === x} onChange={() => { setExpiry(x); setNeverConfirmed(false) }} />
            {EXPIRY_LABEL[x]}
          </label>
        ))}
      </fieldset>
      </fieldset>
      {expiry === "never" ? (
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={neverConfirmed} onChange={(e) => setNeverConfirmed(e.target.checked)} />
          I understand this link never expires
        </label>
      ) : null}
      {/* A PERMANENT LINK SAYS SO on the button that makes it: the confirmation changes what you are
          about to do, so the action names it (C2). */}
      <Button weight="strong" type="submit" disabled={blocked}>
        {busy ? "Working…" : expiry === "never" && neverConfirmed ? "Create a permanent link" : "Create link"}
      </Button>
    </form>
  )
}
