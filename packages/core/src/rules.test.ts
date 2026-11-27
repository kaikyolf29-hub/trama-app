import { describe, expect, it } from 'vitest';
import { videoFlowExample } from './fixtures';
import { flowContentSchema } from './flow';
import { GRID_SIZE, snapToGrid } from './geometry';
import { presentationStepNumber } from './presentation';
import { setBadgeDone, statusBadgeSchema } from './status';

describe('snapToGrid', () => {
  it('usa a grade de 8 px', () => {
    expect(GRID_SIZE).toBe(8);
    expect(snapToGrid(13)).toBe(16);
    expect(snapToGrid(11)).toBe(8);
    expect(snapToGrid(-3)).toBe(0);
    expect(Object.is(snapToGrid(-3), -0)).toBe(false);
    expect(snapToGrid(-13)).toBe(-16);
  });
});

describe('setBadgeDone', () => {
  const now = new Date('2026-11-12T22:40:00.000Z');
  const pending = statusBadgeSchema.parse({});

  it('ao marcar, registra a hora', () => {
    expect(setBadgeDone(pending, true, now)).toEqual({
      label: 'Vídeo pronto',
      done: true,
      doneAt: '2026-11-12T22:40:00.000Z',
    });
  });

  it('marcar de novo mantém a hora original', () => {
    const done = setBadgeDone(pending, true, now);
    expect(setBadgeDone(done, true, new Date('2027-01-01T00:00:00Z'))).toEqual(done);
  });

  it('ao desmarcar, apaga a hora', () => {
    const undone = setBadgeDone(setBadgeDone(pending, true, now), false);
    expect(undone).toEqual({ label: 'Vídeo pronto', done: false });
    expect(statusBadgeSchema.safeParse(undone).success).toBe(true);
  });
});

describe('presentationStepNumber', () => {
  const flow = flowContentSchema.parse(videoFlowExample);

  it('diz em que passo da aula o nó aparece, começando em 1', () => {
    expect(presentationStepNumber(flow.presentation, 'card-projeto')).toBe(1);
    expect(presentationStepNumber(flow.presentation, 'texto-roteiro')).toBe(2);
    expect(presentationStepNumber(flow.presentation, 'frame-ideias')).toBe(4);
  });

  it('devolve undefined para nó fora da aula', () => {
    expect(presentationStepNumber(flow.presentation, 'link-brutos')).toBeUndefined();
  });
});
