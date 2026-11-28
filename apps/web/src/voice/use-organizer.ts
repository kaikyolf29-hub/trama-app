import {
  aiOrganizeRequestSchema,
  type AiEstimateResponse,
  type AiErrorCode,
  type AiOrganizeFormat,
  type AiOrganizeResponse,
  type AiSettings,
} from '@trama/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiApi } from '../api/ai-api';
import { ApiError } from '../api/http';

/** Espera depois da última mudança do texto antes de pedir a estimativa de custo. */
export const ESTIMATE_DELAY = 700;

const GENERIC = 'Algo deu errado. Tente de novo em instantes.';

/** O que a tela sabe da IA da pessoa: se está ligada, qual provedor e modelo e se tem chave. */
export type Readiness =
  | { kind: 'loading' }
  /** O site não tem a API configurada (VITE_API_URL). */
  | { kind: 'off' }
  | { kind: 'error'; message: string }
  /** A pessoa ainda não escolheu provedor e modelo. */
  | { kind: 'no-settings' }
  /** Escolheu, mas não guardou a chave desse provedor. */
  | { kind: 'no-key'; settings: AiSettings }
  | { kind: 'ready'; settings: AiSettings };

export type EstimateState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; estimate: AiEstimateResponse }
  | { kind: 'failed'; message: string };

export interface OrganizeFailure {
  message: string;
  code?: AiErrorCode;
}

export type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | {
      kind: 'done';
      /** Muda a cada organização, para a tela recomeçar a inserção. */
      id: number;
      response: AiOrganizeResponse;
      text: string;
      format: AiOrganizeFormat;
    }
  | { kind: 'failed'; failure: OrganizeFailure };

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : GENERIC;
}

/**
 * Tudo o que a organização pela IA precisa do lado da tela: as escolhas de Configurações →
 * IA, a estimativa de custo (que se atualiza sozinha, sem gastar nada) e o pedido de organizar.
 * O texto e o formato vêm de fora; a resposta só vale para o par que a gerou.
 */
export function useOrganizer({
  ai,
  text,
  format,
  paused,
  estimateDelay: delay,
}: {
  ai: AiApi | null;
  text: string;
  format: AiOrganizeFormat;
  /** Gravando ou transcrevendo: o texto ainda muda, então não vale estimar. */
  paused: boolean;
  estimateDelay?: number;
}) {
  const estimateDelay = delay ?? ESTIMATE_DELAY;
  const [readiness, setReadiness] = useState<Readiness>(ai ? { kind: 'loading' } : { kind: 'off' });
  // A estimativa que chegou, e para qual pedido ela vale.
  const [fetched, setFetched] = useState<{ key: string; state: EstimateState } | null>(null);
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const runId = useRef(0);

  useEffect(() => {
    if (!ai) return;
    let alive = true;
    Promise.all([ai.getSettings(), ai.listKeys()]).then(
      ([settings, keys]) => {
        if (!alive) return;
        if (!settings) setReadiness({ kind: 'no-settings' });
        else if (!keys.some((key) => key.provider === settings.provider)) {
          setReadiness({ kind: 'no-key', settings });
        } else setReadiness({ kind: 'ready', settings });
      },
      (error: unknown) => alive && setReadiness({ kind: 'error', message: messageOf(error) }),
    );
    return () => {
      alive = false;
    };
  }, [ai]);

  const ready = readiness.kind === 'ready';
  const request = aiOrganizeRequestSchema.safeParse({ text, format });
  // A estimativa vale para um par texto + formato; muda o par, volta a "calculando".
  const estimateKey = ready && !paused && request.success ? `${format}\n${text}` : null;

  // Pede a estimativa só depois de uma pausa no texto (gravar muda o texto toda hora).
  useEffect(() => {
    if (!ai || estimateKey === null || !request.success) return;
    let alive = true;
    const data = request.data;
    const timer = setTimeout(() => {
      ai.estimate(data).then(
        (value) =>
          alive && setFetched({ key: estimateKey, state: { kind: 'ready', estimate: value } }),
        (error: unknown) =>
          alive &&
          setFetched({ key: estimateKey, state: { kind: 'failed', message: messageOf(error) } }),
      );
    }, estimateDelay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `request` é derivado de `text` e `format`, que já estão em `estimateKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, estimateKey, estimateDelay]);

  let estimate: EstimateState = { kind: 'idle' };
  if (estimateKey !== null) {
    estimate = fetched?.key === estimateKey ? fetched.state : { kind: 'loading' };
  } else if (ready && !request.success && text.trim() !== '') {
    estimate = { kind: 'failed', message: request.error.issues[0]?.message ?? 'Pedido inválido.' };
  }

  const organize = useCallback(() => {
    if (!ai) return;
    const parsed = aiOrganizeRequestSchema.safeParse({ text, format });
    if (!parsed.success) {
      setRun({
        kind: 'failed',
        failure: { message: parsed.error.issues[0]?.message ?? 'Pedido inválido.' },
      });
      return;
    }
    const id = ++runId.current;
    setRun({ kind: 'running' });
    ai.organize(parsed.data).then(
      (response) => {
        if (id !== runId.current) return;
        setRun({
          kind: 'done',
          id,
          response,
          text: parsed.data.text,
          format: parsed.data.format,
        });
      },
      (error: unknown) => {
        if (id !== runId.current) return;
        setRun({
          kind: 'failed',
          failure: {
            message: messageOf(error),
            ...(error instanceof ApiError && error.code ? { code: error.code } : {}),
          },
        });
      },
    );
  }, [ai, text, format]);

  return { readiness, estimate, run, organize };
}
