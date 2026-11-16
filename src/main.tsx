import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/estilos.css';
import { registrarPwa } from './ui/pwa';
import { aplicarTema } from './ui/tema';

registrarPwa();
aplicarTema();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
