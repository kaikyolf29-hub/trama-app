import '@fontsource-variable/inter';
import '@fontsource-variable/lora';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/caveat';
import '@trama/canvas/styles.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createBackendFromEnv } from './env';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado no index.html');

const backend = createBackendFromEnv();

createRoot(root).render(
  <StrictMode>
    <App client={backend.auth} services={backend.services} />
  </StrictMode>,
);
