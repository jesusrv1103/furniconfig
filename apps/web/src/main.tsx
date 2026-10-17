import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// FASE-4C-A: selector de ruta por hash (#/modeler → modelador;
// el resto → configurador, igual que siempre).
import { AppRoot } from './AppRoot.js';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(container).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
