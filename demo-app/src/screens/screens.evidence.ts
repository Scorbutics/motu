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
    name: 'a path opens the screen that serves it',
    screen: 'home',
    steps: [{ navigate: '/events', expectScreen: 'events' }],
  },
];
