import {
  blockSchema,
  createEmptyFlow,
  type FlowContent,
  type SaveProjectResponse,
} from '@trama/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver, type SaveStatus } from './autosave';

type SaveFn = (
  content: FlowContent,
  base: number,
  options: { keepalive: boolean },
) => Promise<SaveProjectResponse>;

/** Um fluxo com um texto só, para saber qual versão foi enviada. */
const flow = (n: number): FlowContent => ({
  ...createEmptyFlow(),
  blocks: [
    blockSchema.parse({
      id: `texto-${n}`,
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 56 },
      text: `versão ${n}`,
    }),
  ],
});

describe('salvar sozinho', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(save = vi.fn<SaveFn>()) {
    let revision = 1;
    save.mockImplementation(() => {
      revision += 1;
      return Promise.resolve({
        revision,
        updatedAt: `2026-11-27T10:0${revision}:00.000Z`,
        overwrote: false,
      });
    });
    const statuses: SaveStatus['kind'][] = [];
    const saver = new Autosaver(save, {
      revision: 1,
      onStatus: (status) => statuses.push(status.kind),
    });
    return { save, saver, statuses };
  }

  it('espera 2 s sem mudanças e manda só a última', async () => {
    const { save, saver, statuses } = setup();
    saver.push(flow(1));
    await vi.advanceTimersByTimeAsync(1500);
    saver.push(flow(2));
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toEqual(flow(2));
    expect(save.mock.calls[0]?.[1]).toBe(1);
    expect(statuses.at(-1)).toBe('saved');
    expect(saver.dirty).toBe(false);
  });

  it('usa a revisão devolvida na gravação seguinte', async () => {
    const { save, saver } = setup();
    saver.push(flow(1));
    await vi.advanceTimersByTimeAsync(2000);
    saver.push(flow(2));
    await vi.advanceTimersByTimeAsync(2000);
    expect(save.mock.calls.map((call) => call[1])).toEqual([1, 2]);
  });

  it('nunca manda dois pedidos ao mesmo tempo', async () => {
    let release: () => void = () => undefined;
    const save = vi.fn<SaveFn>();
    const { saver } = setup(save);
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ revision: 2, updatedAt: '2026-11-27T10:02:00.000Z', overwrote: false });
        }),
    );
    saver.push(flow(1));
    await vi.advanceTimersByTimeAsync(2000);
    saver.push(flow(2));
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toEqual(flow(2));
    expect(save.mock.calls[1]?.[1]).toBe(2);
  });

  it('quando falha, avisa e tenta de novo com espera crescente, sem perder a mudança', async () => {
    const save = vi.fn<SaveFn>();
    const { saver, statuses } = setup(save);
    save
      .mockRejectedValueOnce(new Error('Sem conexão'))
      .mockRejectedValueOnce(new Error('Sem conexão'));
    saver.push(flow(1));
    await vi.advanceTimersByTimeAsync(2000);
    expect(statuses.at(-1)).toBe('error');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[2]?.[0]).toEqual(flow(1));
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flush salva na hora o que estiver pendente', async () => {
    const { save, saver } = setup();
    saver.push(flow(1));
    await saver.flush({ keepalive: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[2]).toEqual({ keepalive: true });
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
