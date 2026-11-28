import type { Page } from '@playwright/test';

/** O Whisper falso das telas de voz (etapas 3.2 e 3.3): veja `window.__TRAMA_VOICE_TEST__`. */
declare global {
  interface Window {
    /** Libera o `load` do transcritor falso (o download do modelo). */
    __finishModelLoad?: () => void;
    __heard?: number[];
  }
}

/** Instala o transcritor falso: o download fica parado em 45% até o teste liberar. */
export async function installFakeWhisper(page: Page, texts: string[]) {
  await page.addInitScript((spoken) => {
    window.__heard = [];
    let release: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    window.__finishModelLoad = release;
    window.__TRAMA_VOICE_TEST__ = {
      device: 'wasm',
      transcriber: {
        load: async ({ onProgress }) => {
          onProgress(45);
          await loaded;
          return { device: 'wasm' };
        },
        transcribe: (audio) => {
          const heard = window.__heard ?? [];
          heard.push(audio.length);
          return Promise.resolve(spoken[heard.length - 1] ?? `texto ${heard.length}`);
        },
        dispose: () => undefined,
      },
    };
  }, texts);
}
