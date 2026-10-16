import { defineConfig } from 'vite';

/**
 * FASE-4B-C — configuración de Vite SOLO para el experimento del Kernel
 * Worker (`worker-perf`). Aísla la medición del visor principal de clósets
 * (`apps/web` no se toca).
 */
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // el WASM queda como asset suelto para medir su tamaño real
    assetsInlineLimit: 0,
  },
});
