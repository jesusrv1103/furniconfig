import { defineConfig } from 'vite';

/**
 * FASE-4B-0 — configuración de Vite SOLO para el experimento V1.
 * Aísala la prueba de carga del kernel del visor principal de clósets
 * (`apps/web` no se toca).
 */
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // dejamos el WASM como asset suelto para poder medir su tamaño real
    assetsInlineLimit: 0,
  },
});
