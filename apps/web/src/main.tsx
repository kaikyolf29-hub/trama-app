import '@fontsource-variable/inter';
import '@fontsource-variable/lora';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/caveat';
import '@trama/canvas/styles.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAuthClientFromEnv } from './env';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado no index.html');

createRoot(root).render(
  <StrictMode>
    <App client={createAuthClientFromEnv()} />
  </StrictMode>,
);
