import {
  aiEstimateResponseSchema,
  aiKeySummarySchema,
  aiKeysResponseSchema,
  aiKeyLast4,
  aiModelsResponseSchema,
  aiOrganizeRequestSchema,
  aiOrganizeResponseSchema,
  aiProviderSchema,
  aiSettingsResponseSchema,
  aiSettingsSchema,
  saveAiKeyRequestSchema,
  type AiErrorCode,
  type AiSettings,
  type AiProvider as AiProviderId,
} from '@trama/core';
import { AiError, type AiProvider, type OrganizeParams } from '@trama/ai';
import { Hono, type Context } from 'hono';
import type { Deps } from '../deps';
import { jwtSubject } from '../drive/routes';
import { CryptoError, type Vault } from '../drive/vault';
import type { Env } from '../env';
import { createRateLimiter } from './rate-limit';

type AiEnv = { Bindings: Env; Variables: { token: string; deps: Deps } };
type Ctx = Context<AiEnv>;

/** Pedidos por pessoa por minuto: organizar custa mais (e demora mais) que o resto. */
export const ORGANIZE_PER_MINUTE = 6;
export const OTHER_PER_MINUTE = 30;

const NOT_CONFIGURED = 'A IA ainda não está ligada neste ambiente.';
const NO_SETTINGS = 'Escolha o provedor e o modelo em Configurações, na seção IA.';

/** O código de cada erro de IA e o status HTTP que a API devolve. */
const STATUS: Record<AiErrorCode, 409 | 422 | 429 | 502 | 503> = {
  not_configured: 503,
  no_key: 409,
  no_settings: 409,
  key_rejected: 422,
  provider_rate_limited: 429,
  too_many_requests: 429,
  refused: 422,
  truncated: 422,
  bad_output: 502,
  provider_error: 502,
};

function fail(c: Ctx, code: AiErrorCode, message: string, headers?: Record<string, string>) {
  return c.json({ error: message, code }, STATUS[code], headers);
}

async function body(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** O dado associado de cada chave: presa à pessoa e ao provedor (uma linha copiada não abre). */
const keyAad = (uid: string, provider: AiProviderId) => `ai-key:${uid}:${provider}`;

/** Pedido pronto para o provedor, ou a resposta de erro que a rota devolve no lugar. */
type Prepared =
  | { response: Response }
  | {
      provider: AiProvider;
      settings: AiSettings;
      params: OrganizeParams;
    };

/**
 * Rotas da IA (docs/PLAN.md, etapa 3.1). A chave de cada pessoa é cifrada com o `Vault` (mesma
 * `TOKEN_ENCRYPTION_KEY` do Drive) e nunca volta ao navegador nem entra em log: as respostas só
 * trazem os 4 últimos caracteres. Provedor, modelo e esforço vêm das preferências salvas.
 */
export function aiRoutes() {
  const routes = new Hono<AiEnv>();
  const organizeLimit = createRateLimiter(ORGANIZE_PER_MINUTE);
  const otherLimit = createRateLimiter(OTHER_PER_MINUTE);

  /** Conta o pedido e recusa de vez quando passa do limite por minuto. */
  function limited(c: Ctx, kind: 'organize' | 'other', uid: string) {
    const wait = (kind === 'organize' ? organizeLimit : otherLimit).hit(
      uid,
      c.var.deps.now().getTime(),
    );
    return wait === null
      ? null
      : fail(c, 'too_many_requests', 'Muitos pedidos seguidos. Espere um minuto e tente de novo.', {
          'Retry-After': String(wait),
        });
  }

  /** Roda um pedido de IA: erros do provedor viram resposta; o que não se conhece não vaza. */
  async function guarded(c: Ctx, run: () => Promise<Response>): Promise<Response> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof AiError) return fail(c, error.code, error.message);
      if (error instanceof CryptoError) {
        return fail(c, 'no_key', 'Não deu para abrir a chave guardada. Cole a chave de novo.');
      }
      // Erros de rede ou do banco seguem para o tratamento geral (sem texto de provedor nos logs).
      throw error;
    }
  }

  async function whoAndVault(c: Ctx) {
    const uid = jwtSubject(c.var.token);
    const vault = await c.var.deps.vault(c.env ?? {});
    return { uid, vault };
  }

  /** O provedor pronto para usar, com a chave decifrada da pessoa. */
  async function providerWithKey(
    c: Ctx,
    provider: AiProviderId,
    uid: string,
    vault: Vault,
  ): Promise<AiProvider | Response> {
    const stored = await c.var.deps.ai(c.env ?? {}, c.var.token).getKey(provider);
    if (!stored) {
      return fail(c, 'no_key', 'Guarde a chave deste provedor em Configurações, na seção IA.');
    }
    const apiKey = await vault.decrypt(stored.keyEncrypted, keyAad(uid, provider));
    return c.var.deps.aiProvider(provider, apiKey);
  }

  routes.get('/settings', async (c) => {
    const settings = await c.var.deps.ai(c.env ?? {}, c.var.token).getSettings();
    return c.json(aiSettingsResponseSchema.parse({ settings }));
  });

  routes.put('/settings', async (c) => {
    const parsed = aiSettingsSchema.safeParse(await body(c));
    if (!parsed.success)
      return c.json({ error: 'Escolha um provedor, um modelo e o esforço.' }, 400);
    const saved = await c.var.deps.ai(c.env ?? {}, c.var.token).saveSettings(parsed.data);
    return c.json(aiSettingsSchema.parse(saved));
  });

  routes.get('/keys', async (c) => {
    const keys = await c.var.deps.ai(c.env ?? {}, c.var.token).listKeys();
    return c.json(aiKeysResponseSchema.parse({ keys }));
  });

  /** Guarda (ou troca) a chave: antes, testa com a lista de modelos e recusa se não funcionar. */
  routes.put('/keys/:provider', (c) =>
    guarded(c, async () => {
      const provider = aiProviderSchema.safeParse(c.req.param('provider'));
      if (!provider.success) return c.json({ error: 'Provedor desconhecido.' }, 404);
      const request = saveAiKeyRequestSchema.safeParse(await body(c));
      if (!request.success) {
        return c.json(
          { error: request.error.issues[0]?.message ?? 'Cole a chave do provedor.' },
          400,
        );
      }
      const { uid, vault } = await whoAndVault(c);
      if (!uid) return c.json({ error: 'Entre na sua conta para continuar.' }, 401);
      if (!vault) return fail(c, 'not_configured', NOT_CONFIGURED);
      const wait = limited(c, 'other', uid);
      if (wait) return wait;

      const { apiKey } = request.data;
      // Chave que o provedor recusa não é guardada.
      await c.var.deps.aiProvider(provider.data, apiKey).listModels();
      const keyEncrypted = await vault.encrypt(apiKey, keyAad(uid, provider.data));
      const summary = await c.var.deps.ai(c.env ?? {}, c.var.token).saveKey({
        provider: provider.data,
        keyEncrypted,
        last4: aiKeyLast4(apiKey),
      });
      return c.json(aiKeySummarySchema.parse(summary));
    }),
  );

  routes.delete('/keys/:provider', async (c) => {
    const provider = aiProviderSchema.safeParse(c.req.param('provider'));
    if (!provider.success) return c.json({ error: 'Provedor desconhecido.' }, 404);
    await c.var.deps.ai(c.env ?? {}, c.var.token).deleteKey(provider.data);
    return c.body(null, 204);
  });

  /** Os modelos que o provedor libera para a conta da pessoa, lidos na hora. */
  routes.get('/models/:provider', (c) =>
    guarded(c, async () => {
      const provider = aiProviderSchema.safeParse(c.req.param('provider'));
      if (!provider.success) return c.json({ error: 'Provedor desconhecido.' }, 404);
      const { uid, vault } = await whoAndVault(c);
      if (!uid) return c.json({ error: 'Entre na sua conta para continuar.' }, 401);
      if (!vault) return fail(c, 'not_configured', NOT_CONFIGURED);
      const wait = limited(c, 'other', uid);
      if (wait) return wait;
      const ready = await providerWithKey(c, provider.data, uid, vault);
      if (ready instanceof Response) return ready;
      return c.json(aiModelsResponseSchema.parse({ models: await ready.listModels() }));
    }),
  );

  /** Tudo o que estimar e organizar têm em comum: pedido válido, preferências e chave. */
  async function prepare(c: Ctx, kind: 'organize' | 'other'): Promise<Prepared> {
    const request = aiOrganizeRequestSchema.safeParse(await body(c));
    if (!request.success) {
      return {
        response: c.json({ error: request.error.issues[0]?.message ?? 'Pedido inválido.' }, 400),
      };
    }
    const { uid, vault } = await whoAndVault(c);
    if (!uid) return { response: c.json({ error: 'Entre na sua conta para continuar.' }, 401) };
    if (!vault) return { response: fail(c, 'not_configured', NOT_CONFIGURED) };
    const wait = limited(c, kind, uid);
    if (wait) return { response: wait };
    const settings = await c.var.deps.ai(c.env ?? {}, c.var.token).getSettings();
    if (!settings) return { response: fail(c, 'no_settings', NO_SETTINGS) };
    const ready = await providerWithKey(c, settings.provider, uid, vault);
    if (ready instanceof Response) return { response: ready };
    return {
      provider: ready,
      settings,
      params: {
        model: settings.model,
        effort: settings.effort,
        format: request.data.format,
        text: request.data.text,
      },
    };
  }

  routes.post('/estimate', (c) =>
    guarded(c, async () => {
      const prepared = await prepare(c, 'other');
      if ('response' in prepared) return prepared.response;
      const estimate = await prepared.provider.estimate(prepared.params);
      return c.json(
        aiEstimateResponseSchema.parse({
          provider: prepared.settings.provider,
          model: prepared.settings.model,
          ...estimate,
        }),
      );
    }),
  );

  routes.post('/organize', (c) =>
    guarded(c, async () => {
      const prepared = await prepare(c, 'organize');
      if ('response' in prepared) return prepared.response;
      const result = await prepared.provider.organize(prepared.params);
      // A saída já passou pelo core dentro do provedor; aqui o contrato da resposta fecha o ciclo.
      return c.json(
        aiOrganizeResponseSchema.parse({
          provider: prepared.settings.provider,
          model: prepared.settings.model,
          ...result,
        }),
      );
    }),
  );

  return routes;
}
