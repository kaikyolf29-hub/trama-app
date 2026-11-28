import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveCopier, type DriveCopyStatus } from './drive-copier';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(
  copy: (options: { keepalive: boolean }) => Promise<{ copiedAt: string }> = () =>
    Promise.resolve({ copiedAt: '2026-11-27T12:00:00.000Z' }),
  initial?: string,
) {
  const calls: { keepalive: boolean }[] = [];
  const statuses: DriveCopyStatus[] = [];
  const copier = new DriveCopier(
    (options) => {
      calls.push(options);
      return copy(options);
    },
    { onStatus: (status) => statuses.push(status), copied: initial },
    30_000,
  );
  return { copier, calls, statuses };
}

describe('DriveCopier', () => {
  it('só copia 30 s depois da primeira mudança, e várias mudanças viram uma cópia', async () => {
    const { copier, calls, statuses } = setup();
    copier.markDirty();
    await vi.advanceTimersByTimeAsync(10_000);
    copier.markDirty();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toEqual([{ keepalive: false }]);
    expect(statuses.at(-1)).toEqual({ kind: 'copied', at: '2026-11-27T12:00:00.000Z' });
    // Sem mudança, não copia de novo.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
  });

  it('sem mudança, nada vai para o Drive', async () => {
    const { copier, calls } = setup(undefined, '2026-11-27T11:00:00.000Z');
    await copier.flush();
    expect(calls).toHaveLength(0);
  });

  it('começa mostrando "copiado" quando o projeto já tem cópia e nada mudou', () => {
    const { statuses } = setup(undefined, '2026-11-27T11:00:00.000Z');
    expect(statuses).toEqual([{ kind: 'copied', at: '2026-11-27T11:00:00.000Z' }]);
  });

  it('copia já ao fechar a aba (flush com keepalive)', async () => {
    const { copier, calls } = setup();
    copier.markDirty();
    await copier.flush({ keepalive: true });
    expect(calls).toEqual([{ keepalive: true }]);
    expect(copier.pending).toBe(false);
  });

  it('"soon" copia logo, para o projeto que ainda não tem cópia no Drive', async () => {
    const { copier, calls } = setup();
    copier.markDirty({ soon: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
  });

  it('cópia que falha fica na fila e tenta de novo na próxima rodada', async () => {
    let fail = true;
    const { copier, calls, statuses } = setup(() =>
      fail
        ? Promise.reject(new Error('O Google recusou.'))
        : Promise.resolve({ copiedAt: '2026-11-27T12:01:00.000Z' }),
    );
    copier.markDirty();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(statuses.at(-1)).toEqual({ kind: 'error', message: 'O Google recusou.' });
    expect(copier.pending).toBe(true);
    fail = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(2);
    expect(statuses.at(-1)).toEqual({ kind: 'copied', at: '2026-11-27T12:01:00.000Z' });
  });

  it('nunca faz dois pedidos ao mesmo tempo; a mudança do meio vai na rodada seguinte', async () => {
    let release: () => void = () => undefined;
    const { copier, calls } = setup(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ copiedAt: '2026-11-27T12:00:00.000Z' });
        }),
    );
    copier.markDirty();
    const first = copier.flush();
    await vi.advanceTimersByTimeAsync(0);
    copier.markDirty();
    const second = copier.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await Promise.all([first, second]);
    expect(calls).toHaveLength(2);
  });

  it('depois de descartado, não copia mais', async () => {
    const { copier, calls } = setup();
    copier.markDirty();
    copier.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    copier.markDirty();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(0);
  });
});
