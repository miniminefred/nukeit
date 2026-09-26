import { defineConfig } from 'vite';

// Port 8093 so the dev server can run alongside the other games on this
// machine: blobgame 8080, fpsgame 8090, medieval 8091, destroy 8092.
// The GitHub Pages base path is passed as `--base` by the deploy workflow,
// so dev and preview keep serving from /.
export default defineConfig({
  server: { port: 8093, strictPort: true, open: true },
  preview: { port: 8093, strictPort: true },
});
