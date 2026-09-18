// @ts-check
import { defineConfig } from 'astro/config';

// Tauri embarque le contenu de `dist/` comme des assets statiques.
// Le format `directory` garde des routes propres : /agents -> agents/index.html.
export default defineConfig({
  output: 'static',
  build: {
    format: 'directory',
  },
});
