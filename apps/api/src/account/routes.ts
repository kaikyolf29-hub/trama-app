import { profileSchema, updateProfileRequestSchema } from '@trama/core';
import { Hono, type Context } from 'hono';
import type { AccountStore } from './store';

type Variables = { accountStore: AccountStore };
type Ctx = Context<{ Variables: Variables }>;

const NO_PROFILE = 'Perfil não encontrado.';

/** Lê o corpo em JSON; corpo quebrado vira undefined (e a validação recusa). */
async function body(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * Rotas da conta (docs/PLAN.md, etapa 2.5): o perfil da pessoa. O e-mail e a senha são do
 * Supabase Auth e o site os troca direto lá. Entrada e saída passam pelos esquemas do core.
 */
export function accountRoutes() {
  const routes = new Hono<{ Variables: Variables }>();

  routes.get('/profile', async (c) => {
    const profile = await c.var.accountStore.getProfile();
    if (!profile) return c.json({ error: NO_PROFILE }, 404);
    return c.json(profileSchema.parse(profile));
  });

  routes.patch('/profile', async (c) => {
    const parsed = updateProfileRequestSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'Dados do perfil inválidos.' }, 400);
    const profile = await c.var.accountStore.updateProfile(parsed.data);
    if (!profile) return c.json({ error: NO_PROFILE }, 404);
    return c.json(profileSchema.parse(profile));
  });

  return routes;
}
