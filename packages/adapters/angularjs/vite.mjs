// The AngularJS ocean's contribution to the lagoon's Vite config.
//
// Unlike the Next host, this one adds no aliases: a workspace-linked ocean resolves @motu/* through
// node_modules already. What it does add is the part a legacy backend forces — a single-origin dev
// proxy and HTTPS.
//
// The standalone lagoon runs the SAME components as the embedded bridge, but against the real legacy
// backend through a dev proxy — NOT CORS. The browser talks only to https://localhost:5173; Vite
// forwards /api/* to the running app server. Auth is why this must be HTTPS: the login page is
// reCAPTCHA site-key locked, so you do NOT log in through the proxy — you log in at the real origin,
// and its session + XSRF cookies are host-only `localhost` Secure cookies, which therefore also flow
// to https://localhost:5173 (same host, port-agnostic).
//
// The proxy TARGET is a project fact, so it comes from lagoon.config.json ("proxy"), not from here.
export async function contribute({ lagoonJson, env, resolveBuildDep }) {
  // MOTU_NO_SSL=1 serves plain HTTP (no dev cert) — used for mock-backed design previews and tooling
  // that don't need the session-cookie flow. Default stays HTTPS for real backend proxying.
  const noSsl = env.MOTU_NO_SSL === '1';
  const basicSsl = noSsl ? null : await resolveBuildDep('@vitejs/plugin-basic-ssl');

  const proxy = lagoonJson.proxy
    ? Object.fromEntries(
        Object.entries(lagoonJson.proxy).map(([path, target]) => [
          path,
          {
            target,
            changeOrigin: false,
            secure: false, // self-signed dev cert
            cookieDomainRewrite: '',
          },
        ]),
      )
    : undefined;

  return {
    plugins: basicSsl ? [basicSsl()] : [],
    server: { https: !noSsl, ...(proxy ? { proxy } : {}) },
  };
}
