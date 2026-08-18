import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Project-wide default island/region isolation, read from the repo's motu.config.json so the lagoon
// previews the same posture as prod. Falls back to 'shadow' (the safe framework default).
function motuIsolation() {
  try {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../../motu.config.json'), 'utf8'));
    return cfg.isolation === 'light' ? 'light' : 'shadow';
  } catch {
    return 'shadow';
  }
}

// Standalone SPA composition root. It runs the SAME components as the embedded bridge, but against
// the real legacy backend via a single-origin dev proxy — NOT CORS. The browser talks only to
// https://localhost:5173; Vite forwards /api/* to the running WildFly.
//
// Auth: the login page uses reCAPTCHA (site-key locked), so we do NOT log in through the proxy.
// Instead, log in at the real origin https://localhost:8443/api/. Its session + M-XSRF-TOKEN are
// host-only "localhost" Secure cookies, so they also flow to https://localhost:5173 (same host,
// port-agnostic). That's why this dev server must be HTTPS too.
export default defineConfig({
  // MOTU_NO_SSL=1 serves plain HTTP (no dev cert) — used for mock-backed design previews/tooling
  // that don't need the session-cookie flow. Default stays HTTPS for real backend proxying.
  plugins: process.env.MOTU_NO_SSL === '1' ? [react()] : [react(), basicSsl()],
  // MOTU_TRANSPORT=http|mock picks the default transport at build/dev time. It only sets the
  // default — a per-browser toggle (?transport= / localStorage) still overrides it at runtime.
  // Unset defaults to 'mock' so agents get backend-free dev data without any login.
  define: {
    __MOTU_TRANSPORT__: JSON.stringify(process.env.MOTU_TRANSPORT ?? ''),
    // Lagoon target + fit (single-island / single-archipelago isolation). Unset => members archipelago.
    __MOTU_TARGET__: JSON.stringify(process.env.MOTU_TARGET ?? ''),
    __MOTU_FIT__: JSON.stringify(process.env.MOTU_FIT ?? ''),
    // Force all contract calls to fail with this status (verify's error-resilience mount). Unset => off.
    __MOTU_FORCE_ERROR__: JSON.stringify(process.env.MOTU_FORCE_ERROR ?? ''),
    // The lagoon is the sandbox — the debug overlay is always present here (visibility is still off by
    // default, revealed by the affordance/shortcut). Set MOTU_DEBUG=0 to strip it.
    __MOTU_DEBUG__: JSON.stringify(process.env.MOTU_DEBUG !== '0'),
    // Project-wide default isolation, injected from motu.config.json (see setDefaultIsolation).
    __MOTU_ISOLATION__: JSON.stringify(motuIsolation()),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        lagoon: resolve(__dirname, 'lagoon.html'),
      },
    },
  },
  server: {
    port: 5173,
    https: process.env.MOTU_NO_SSL !== '1',
    proxy: {
      '/api': {
        target: 'https://localhost:8443',
        changeOrigin: false,
        secure: false, // self-signed dev cert
        cookieDomainRewrite: '',
      },
    },
  },
});
