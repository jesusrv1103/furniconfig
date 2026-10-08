import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @vitejs/plugin-react transforma TSX con el runtime
// automático de JSX (no se requiere importar React).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
