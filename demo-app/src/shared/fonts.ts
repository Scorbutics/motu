// The app's typeface, shipped WITH the app: Bricolage Grotesque, variable in weight and optical size.
//
// WHY A PACKAGE AND NOT A FONT SERVICE. The stylesheet asked for "Inter" for its whole life and never
// loaded it, so every screen fell back to whatever the visitor's system had — Ubuntu here, Segoe
// there, SF on a Mac — and the product looked different, and generic, on every machine. Bundling the
// files means the app, the public sandbox, the lagoon and the published lagoon all render the same
// face offline, with no request to a third party.
//
// THE OPTICAL-SIZE CUT, not the weight-only one: the axis is what gives large headings (a member's
// name, the brand) their character while small text stays open and readable — one family, no pairing.
//
// Imported for its side effect by each composition root (`roots/app`, `roots/lagoon`). It lives in
// this package because the dependency does: the roots resolve `demo-app/fonts`, and pnpm's strict
// layout would not let them resolve the font package directly.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
