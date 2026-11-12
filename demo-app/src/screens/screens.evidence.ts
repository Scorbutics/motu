// What navigating between the demo's screens must do, as flows the runtime check replays
// (`motu screen verify`, and `motu check --runtime`).
//
// A SCREEN FLOW is the one place a coupling ACROSS regions is asserted: the shell's sidebar is one
// region, the page beside it another, and only the app's own link joins them. Each step clicks what a
// person clicks — or navigates to a path — and asserts which screen is open and what a slot renders.
//
// No application imports: this file is read by plain node, where `@/` does not resolve.
export const scenarios = [
  {
    name: 'the sidebar opens the member directory',
    screen: 'home',
    steps: [
      // The sidebar's own link, routed by the app's own navigation to the screen that serves it.
      { click: 'Members', expectScreen: 'directory', expectRender: { 'member-results': 'Allen' } },
    ],
  },
  {
    // SOMEONE ELSE SIGNED IN, in the lagoon's `karen-signed-in` world: Karen Okonkwo, whose membership
    // is suspended. Who is signed in is what the page hands the shell — a fact no screen flow could
    // change before worlds — and the events page has to say what that membership cannot do.
    name: 'a suspended member is told they cannot RSVP',
    world: 'karen-signed-in',
    screen: 'events',
    steps: [{ expectScreen: 'events', expectRender: { 'app-nav': 'Karen', 'events-header': 'A suspended membership cannot RSVP' } }],
  },
  {
    name: 'a path opens the screen that serves it',
    screen: 'home',
    steps: [{ navigate: '/events', expectScreen: 'events' }],
  },
];
