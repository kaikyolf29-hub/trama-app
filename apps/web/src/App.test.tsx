import { createEmptyFlow, flowContentSchema } from '@trama/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

describe('App', () => {
  it('abre a casca do site', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Trama' })).toBeDefined();
  });

  it('enxerga o contrato de @trama/core', () => {
    expect(flowContentSchema.safeParse(createEmptyFlow()).success).toBe(true);
  });
});
