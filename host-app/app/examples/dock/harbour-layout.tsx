import type { ReactNode } from "react"
import { Bay, Mark } from "@motujs/chrome/react"

/**
 * The harbour's ARRANGEMENT — the dock example's outer page.
 *
 * `readout` sits in the bay. That is its FALLBACK: the archipelago docks it beside the quay's list
 * (`dockInto: { region: 'quay', dock: 'quay-aside' }`), and only when the quay is not on screen does it
 * render here. There is no portal, no ref and no "is it docked?" prop in this file — motu decides,
 * from what is mounted, and passes `readout` as null while it is elsewhere.
 */
export function HarbourLayout({ readout, account, quay }: { readout?: ReactNode; account?: ReactNode; quay?: ReactNode }) {
  return (
    <>
      <Bay shape="masthead" leading={<Mark />} title="motu" headline="The harbour" blurb="An island of one region, docked in another's arrangement.">
        {readout}
        {account}
      </Bay>
      {quay}
    </>
  )
}
