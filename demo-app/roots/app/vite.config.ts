import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The islands read this at build time (the debug overlay's instrumentation is gated on it). The
  // app is the production shape, so it is false here and true only in the lagoon.
  define: { __MOTU_DEBUG__: 'false' },
  server: { port: 5300 },
});
