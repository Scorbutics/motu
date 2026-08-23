import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { installMotuChrome } from "./shared/motu-chrome"
import "./shared/styles.css"

// Before the app's own stylesheet does anything with them.
installMotuChrome()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
