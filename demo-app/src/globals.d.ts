// Vite raw imports: HTML templates lifted from the legacy app are imported as strings via `?raw`
// (e.g. AngularJS island templates). tsc needs this ambient declaration since demo-app is compiled.
declare module '*.html?raw' {
  const content: string;
  export default content;
}
