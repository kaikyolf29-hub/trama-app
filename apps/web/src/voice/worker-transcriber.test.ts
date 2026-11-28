import { describe, expect, it, vi } from 'vitest';
import { WorkerTranscriber, type WorkerLike } from './worker-transcriber';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

/** Um Worker de mentira: o teste responde as mensagens como quiser. */
function fakeWorker() {
  const sent: { message: WorkerRequest; transfer?: Transferable[] }[] = [];
  const terminate = vi.fn();
  const worker: WorkerLike & {
    reply: (response: WorkerResponse) => void;
    crash: (m: string) => void;
  } = {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn((message: WorkerRequest, transfer?: Transferable[]) => {
      sent.push({ message, transfer });
    }),
    terminate,
    reply: (response) => worker.onmessage?.({ data: response } as MessageEvent<WorkerResponse>),
    crash: (message) => worker.onerror?.({ message } as ErrorEvent),
  };
  return { worker, sent, terminate };
}

describe('WorkerTranscriber', () => {
  it('só cria o Worker na primeira chamada', () => {
    const create = vi.fn(() => fakeWorker().worker);
    const transcriber = new WorkerTranscriber(create);
    expect(create).not.toHaveBeenCalled();
    void transcriber.load({ model: 'base', device: 'wasm', onProgress: () => undefined });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('carrega: repassa o progresso e devolve o dispositivo que ficou em uso', async () => {
    const { worker, sent } = fakeWorker();
    const transcriber = new WorkerTranscriber(() => worker);
    const progress: number[] = [];
    const loading = transcriber.load({
      model: 'small',
      device: 'webgpu',
      onProgress: (p) => progress.push(p),
    });
    expect(sent[0]?.message).toMatchObject({ type: 'load', model: 'small', device: 'webgpu' });
    const id = sent[0]!.message.id;
    worker.reply({ type: 'progress', id, percent: 30 });
    worker.reply({ type: 'progress', id, percent: 80 });
    worker.reply({ type: 'loaded', id, device: 'wasm' });
    await expect(loading).resolves.toEqual({ device: 'wasm' });
    expect(progress).toEqual([30, 80]);
  });

  it('transcreve: manda uma cópia do áudio (transferida) e devolve o texto', async () => {
    const { worker, sent } = fakeWorker();
    const transcriber = new WorkerTranscriber(() => worker);
    const audio = new Float32Array([0.1, 0.2, 0.3]);
    const result = transcriber.transcribe(audio);
    const request = sent[0]!;
    expect(request.message.type).toBe('transcribe');
    expect(request.transfer).toHaveLength(1);
    // O áudio original continua inteiro: foi a cópia que viajou.
    expect(Array.from(audio)).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ]);
    worker.reply({ type: 'result', id: request.message.id, text: 'olá' });
    await expect(result).resolves.toBe('olá');
  });

  it('erro do Worker rejeita só o pedido dele', async () => {
    const { worker, sent } = fakeWorker();
    const transcriber = new WorkerTranscriber(() => worker);
    const a = transcriber.transcribe(new Float32Array(1));
    const b = transcriber.transcribe(new Float32Array(1));
    worker.reply({ type: 'error', id: sent[0]!.message.id, message: 'sem memória' });
    worker.reply({ type: 'result', id: sent[1]!.message.id, text: 'ok' });
    await expect(a).rejects.toThrow('sem memória');
    await expect(b).resolves.toBe('ok');
  });

  it('Worker que cai rejeita tudo o que esperava', async () => {
    const { worker } = fakeWorker();
    const transcriber = new WorkerTranscriber(() => worker);
    const pending = transcriber.transcribe(new Float32Array(1));
    worker.crash('parou');
    await expect(pending).rejects.toThrow('parou');
  });

  it('dispose encerra o Worker e cancela os pedidos', async () => {
    const { worker, terminate } = fakeWorker();
    const transcriber = new WorkerTranscriber(() => worker);
    const pending = transcriber.transcribe(new Float32Array(1));
    transcriber.dispose();
    expect(terminate).toHaveBeenCalled();
    await expect(pending).rejects.toThrow(/cancelada/);
  });
});
