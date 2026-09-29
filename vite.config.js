import { defineConfig } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

// Port 8093 so the dev server can run alongside the other games on this
// machine: blobgame 8080, fpsgame 8090, medieval 8091, destroy 8092.
// The GitHub Pages base path is passed as `--base` by the deploy workflow,
// so dev and preview keep serving from /.

// The collapse bench (src/dev/bench.js) posts its results here when the game
// is opened with ?bench, and they are written to bench/latest.json — so a
// run in a browser window on screen can be read back without anyone copying
// numbers out of the console.
const benchResults = {
  name: 'bench-results',
  configureServer(server) {
    server.middlewares.use('/__bench', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        mkdirSync('bench', { recursive: true });
        writeFileSync('bench/latest.json', body);
        writeFileSync(`bench/run-${Date.now()}.json`, body);
        res.end('ok');
      });
    });
  },
};

export default defineConfig({
  plugins: [benchResults],
  server: { port: 8093, strictPort: true, open: true },
  preview: { port: 8093, strictPort: true },
});
