import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

function pdfAssets(): Plugin {
  const files = ['cmaps', 'standard_fonts', 'wasm'].flatMap(directory => {
    const location = new URL(`./node_modules/pdfjs-dist/${directory}/`, import.meta.url);
    return readdirSync(location, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => ({
      fileName: `pdf-assets/${directory}/${entry.name}`, source: readFileSync(new URL(entry.name, location)),
    }));
  });
  return {
    name: 'local-pdf-assets',
    buildStart() { for (const file of files) this.emitFile({ type: 'asset', ...file }); },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = files.find(file => `/${file.fileName}` === request.url?.split('?')[0]);
        if (!file) return next();
        response.setHeader('Content-Type', file.fileName.endsWith('.wasm') ? 'application/wasm' : file.fileName.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
        response.end(file.source);
      });
    },
  };
}

function offlineApp(): Plugin {
  const template = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('./manifest.json', import.meta.url), 'utf8');
  function publicAssets(directory: URL, prefix = ''): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? publicAssets(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`)
      : [`/${prefix}${entry.name}`]);
  }
  return {
    name: 'offline-app',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = ['/index.html', '/manifest.json', ...Object.keys(bundle).map(name => `/${name}`), ...publicAssets(new URL('./public/', import.meta.url))];
      const hash = createHash('sha256');
      for (const output of Object.values(bundle)) hash.update(output.type === 'chunk' ? output.code : output.source);
      hash.update(manifest);
      hash.update(template);
      hash.update(readFileSync(new URL('./index.html', import.meta.url)));
      for (const path of publicAssets(new URL('./public/', import.meta.url))) hash.update(readFileSync(new URL(`./public${path}`, import.meta.url)));
      const release = hash.digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: manifest });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__OFFLINE_CACHE_NAME__', `maranatha-app-${release}`).replace('__OFFLINE_ASSETS__', JSON.stringify([...new Set(assets)])) });
    },
  };
}
export default defineConfig({
  plugins: [react(), pdfAssets(), offlineApp()],
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 3000 },
});
