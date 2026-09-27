import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'deployment-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/imd-deployment.json' && !/^\/abi\/[A-Za-z0-9]+\.json$/.test(path ?? '')) return next();
        readFile(fileURLToPath(new URL(`../dist${path}`, import.meta.url)))
          .then(bytes => { res.setHeader('Content-Type', 'application/json'); res.end(bytes); })
          .catch(() => { res.statusCode = 503; res.end('Run npm run build to export deployment data.'); });
      });
    },
  }],
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false },
});
