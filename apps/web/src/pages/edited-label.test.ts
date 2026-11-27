import { describe, expect, it } from 'vitest';
import { editedLabel } from './edited-label';

// Sexta-feira, 27 nov 2026, 15:00 na hora local de quem roda o teste.
const now = new Date(2026, 10, 27, 15, 0, 0);
const at = (...args: [number, number, number, number?, number?]) =>
  new Date(args[0], args[1], args[2], args[3] ?? 12, args[4] ?? 0).toISOString();

describe('editedLabel', () => {
  it('agora, minutos e horas no mesmo dia', () => {
    expect(editedLabel(new Date(now.getTime() - 20_000).toISOString(), now)).toBe('agora');
    expect(editedLabel(new Date(now.getTime() - 2 * 60_000).toISOString(), now)).toBe('há 2 min');
    expect(editedLabel(at(2026, 10, 27, 12, 0), now)).toBe('há 3 h');
  });

  it('data no futuro (relógio diferente) vira "agora"', () => {
    expect(editedLabel(new Date(now.getTime() + 5 * 60_000).toISOString(), now)).toBe('agora');
  });

  it('ontem, mesmo se passou menos de 24 horas', () => {
    expect(editedLabel(at(2026, 10, 26, 23, 30), new Date(2026, 10, 27, 0, 10))).toBe('ontem');
    expect(editedLabel(at(2026, 10, 26, 9), now)).toBe('ontem');
  });

  it('dia da semana até seis dias atrás', () => {
    expect(editedLabel(at(2026, 10, 23), now)).toBe('segunda');
    expect(editedLabel(at(2026, 10, 21), now)).toBe('sábado');
  });

  it('depois disso, a data, com o ano só quando é outro', () => {
    expect(editedLabel(at(2026, 10, 12), now)).toBe('12 nov');
    expect(editedLabel(at(2025, 11, 31), now)).toBe('31 dez 2025');
  });

  it('data inválida não quebra a tela', () => {
    expect(editedLabel('não é data', now)).toBe('agora');
  });
});
