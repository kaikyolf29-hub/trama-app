import { describe, expect, it } from 'vitest';
import { app } from './index';

describe('API', () => {
  it('responde /health', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'trama-api' });
  });

  it('responde 404 em português para rota que não existe', async () => {
    const response = await app.request('/nada');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Rota não encontrada.' });
  });
});
