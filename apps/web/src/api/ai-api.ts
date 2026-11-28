import {
  aiEstimateResponseSchema,
  aiKeySummarySchema,
  aiKeysResponseSchema,
  aiModelsResponseSchema,
  aiOrganizeResponseSchema,
  aiSettingsResponseSchema,
  aiSettingsSchema,
  type AiEstimateResponse,
  type AiKeySummary,
  type AiModel,
  type AiOrganizeRequest,
  type AiOrganizeResponse,
  type AiProvider,
  type AiSettings,
} from '@trama/core';
import { z } from 'zod';
import { createCaller } from './http';

/** O que as telas usam da API de IA (apps/api, rotas `/ai`). A chave só vai, nunca volta. */
export interface AiApi {
  /** `null` até a pessoa salvar a primeira escolha. */
  getSettings(): Promise<AiSettings | null>;
  saveSettings(settings: AiSettings): Promise<AiSettings>;
  /** Só o resumo de cada chave guardada (provedor, 4 últimos caracteres, data). */
  listKeys(): Promise<AiKeySummary[]>;
  /** A API testa a chave com o provedor antes de guardar; chave recusada vira erro `key_rejected`. */
  saveKey(provider: AiProvider, apiKey: string): Promise<AiKeySummary>;
  deleteKey(provider: AiProvider): Promise<void>;
  /** Os modelos que o provedor libera para a conta da pessoa. */
  listModels(provider: AiProvider): Promise<AiModel[]>;
  /** Tokens e custo aproximado, antes de enviar (etapa 3.3). */
  estimate(request: AiOrganizeRequest): Promise<AiEstimateResponse>;
  /** Organiza o texto no formato pedido (etapa 3.3). */
  organize(request: AiOrganizeRequest): Promise<AiOrganizeResponse>;
}

interface Config {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export function createAiApi(config: Config): AiApi {
  const call = createCaller(config);
  const json = (method: string, body: unknown): RequestInit => ({
    method,
    body: JSON.stringify(body),
  });
  const path = (provider: AiProvider) => encodeURIComponent(provider);
  return {
    async getSettings() {
      return (await call('/ai/settings', aiSettingsResponseSchema)).settings;
    },
    saveSettings: (settings) => call('/ai/settings', aiSettingsSchema, json('PUT', settings)),
    async listKeys() {
      return (await call('/ai/keys', aiKeysResponseSchema)).keys;
    },
    saveKey: (provider, apiKey) =>
      call(`/ai/keys/${path(provider)}`, aiKeySummarySchema, json('PUT', { apiKey })),
    deleteKey: (provider) =>
      call(`/ai/keys/${path(provider)}`, z.undefined(), { method: 'DELETE' }),
    async listModels(provider) {
      return (await call(`/ai/models/${path(provider)}`, aiModelsResponseSchema)).models;
    },
    estimate: (request) => call('/ai/estimate', aiEstimateResponseSchema, json('POST', request)),
    organize: (request) => call('/ai/organize', aiOrganizeResponseSchema, json('POST', request)),
  };
}
