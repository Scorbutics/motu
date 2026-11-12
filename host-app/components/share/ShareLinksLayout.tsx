import type { ReactNode } from "react"
import { Panel, PanelHead } from "@motu/chrome/react"

/**
 * WHERE THE SHARE-LINKS PAGE'S PARTS SIT — once, for the page and the lagoon (the archipelago's root).
 *
 * The token sits ABOVE both columns while there is one: it is the one thing on this page that will not
 * be shown again, so it is not allowed to scroll out of sight under a list.
 */
export function ShareLinksLayout({
  projectName = "",
  list,
  create,
  token,
}: {
  projectName?: string
  list: ReactNode
  create: ReactNode
  token: ReactNode
}) {
  return (
    <div className="share-links" style={{ display: "grid", gap: 16, padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 20 }}>Share links</h1>
        {projectName ? <p style={{ margin: "4px 0 0", opacity: 0.7 }}>{projectName}</p> : null}
      </header>
      {token}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)", alignItems: "start" }}>
        <Panel>
          <PanelHead title="Links" />
          {list}
        </Panel>
        <Panel>
          <PanelHead title="New link" />
          {create}
        </Panel>
      </div>
    </div>
  )
}
