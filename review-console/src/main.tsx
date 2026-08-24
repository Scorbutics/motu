import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
// FROM THE PACKAGE, not from a local copy. The console used to own thirty lines that put
// `motuChromeCss()` into the head; the same thirty were about to be needed by anything else adopting
// the kit, so they moved to `@motu/chrome` and this is the one line that is left.
import { installMotuChrome } from "@motu/chrome"
import "./shared/styles.css"

// Before the app's own stylesheet does anything with them.
installMotuChrome()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
