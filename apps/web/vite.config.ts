/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * O runtime do Whisper (onnxruntime-web, dentro do Transformers.js) aponta para o seu arquivo
 * .wasm de 27 MB, e o Vite o copiaria para o `dist/`. Ele não cabe no limite de 25 MiB por
 * arquivo da Cloudflare, e o Transformers.js já carrega esse arquivo do jsDelivr por padrão
 * (`env.backends.onnx.wasm.wasmPaths`), então a cópia local nem seria usada: tiramos do pacote.
 */
function dropOnnxWasmCopy(): Plugin {
  return {
    name: 'trama:drop-onnx-wasm-copy',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm[^/]*\.wasm$/.test(name)) delete bundle[name];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // O Worker do Whisper (src/voice) importa o Transformers.js, que se divide em partes: só o
  // formato ES aceita isso.
  worker: { format: 'es', plugins: () => [dropOnnxWasmCopy()] },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
  },
});
