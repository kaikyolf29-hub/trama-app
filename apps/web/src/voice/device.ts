/** Onde o Whisper roda: na placa de vídeo (WebGPU) ou no processador (WASM). */
export type ComputeDevice = 'webgpu' | 'wasm';

/** WebGPU quando existe; senão WASM, que funciona em qualquer navegador, só que mais devagar. */
export function chooseComputeDevice(capabilities: { webgpu: boolean }): ComputeDevice {
  return capabilities.webgpu ? 'webgpu' : 'wasm';
}

/** O mínimo do `navigator.gpu` que usamos (o TypeScript ainda não traz esses tipos). */
interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<GpuAdapter | null> };
}

interface GpuAdapter {
  isFallbackAdapter?: boolean;
  info?: { isFallbackAdapter?: boolean };
}

/** O navegador tem WebGPU e uma placa que o usa? Nunca lança: qualquer falha vale "não". */
export async function detectWebGpu(
  nav: GpuNavigator | undefined = globalThis.navigator,
): Promise<boolean> {
  try {
    if (!nav?.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    // Adaptador "de reserva" é a placa simulada por software (SwiftShader): existe, mas é
    // lenta demais para o Whisper, então vale como se não houvesse WebGPU.
    if (!adapter) return false;
    return !(adapter.isFallbackAdapter ?? adapter.info?.isFallbackAdapter ?? false);
  } catch {
    return false;
  }
}

export async function detectComputeDevice(): Promise<ComputeDevice> {
  return chooseComputeDevice({ webgpu: await detectWebGpu() });
}

/** Aviso para a pessoa quando a transcrição vai ficar lenta; null quando está tudo certo. */
export function deviceNotice(device: ComputeDevice): string | null {
  return device === 'wasm'
    ? 'Este navegador não usa a placa de vídeo para a voz (WebGPU). A transcrição funciona pelo processador e fica mais lenta: o texto pode demorar a aparecer depois que você fala.'
    : null;
}
