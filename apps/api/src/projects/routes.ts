import {
  createEmptyFlow,
  createEmptyScript,
  createProjectRequestSchema,
  flowContentSchema,
  saveProjectRequestSchema,
  scriptContentSchema,
  updateProjectRequestSchema,
} from '@trama/core';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { ProjectStore } from './store';

const idSchema = z.uuid();
const versionIdSchema = z.coerce.number().int().positive();

const NOT_FOUND = 'Projeto não encontrado.';

type Variables = { store: ProjectStore };
type Ctx = Context<{ Variables: Variables }>;

/** Lê o corpo em JSON; corpo quebrado vira undefined (e a validação recusa). */
async function body(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function invalid(c: Ctx, message: string) {
  return c.json({ error: message }, 400);
}

/**
 * Rotas de projetos (docs/PLAN.md, etapa 1.5). Toda entrada passa pelos esquemas do
 * `@trama/core` antes de chegar no banco, e todo fluxo que sai é validado de novo.
 */
export function projectRoutes() {
  const routes = new Hono<{ Variables: Variables }>();

  routes.get('/', async (c) => c.json(await c.var.store.list()));

  routes.post('/', async (c) => {
    const parsed = createProjectRequestSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, 'Dados do projeto inválidos.');
    const request = parsed.data;
    const project = await c.var.store.create(
      request.kind === 'flow'
        ? { kind: 'flow', title: request.title, content: request.content ?? createEmptyFlow() }
        : { kind: 'script', title: request.title, content: request.content ?? createEmptyScript() },
    );
    return c.json(project, 201);
  });

  routes.get('/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: NOT_FOUND }, 404);
    const project = await c.var.store.get(id.data);
    if (!project) return c.json({ error: NOT_FOUND }, 404);
    if (project.kind === 'flow') {
      const content = flowContentSchema.safeParse(project.content);
      // Nunca acontece pelo caminho normal (a API valida ao gravar); se acontecer, não piora.
      if (!content.success) {
        console.error('conteúdo inválido no banco', project.id, content.error.issues);
        return c.json({ error: 'Este projeto tem um conteúdo que o Trama não entende.' }, 422);
      }
      return c.json({ ...project, content: content.data });
    }
    if (project.kind === 'script') {
      const content = scriptContentSchema.safeParse(project.content);
      if (!content.success) {
        console.error('conteúdo inválido no banco', project.id, content.error.issues);
        return c.json({ error: 'Este projeto tem um conteúdo que o Trama não entende.' }, 422);
      }
      return c.json({ ...project, content: content.data });
    }
    return c.json(project);
  });

  routes.put('/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: NOT_FOUND }, 404);
    const parsed = saveProjectRequestSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, 'O fluxo enviado não é válido.');
    const saved = await c.var.store.save(id.data, parsed.data);
    return saved ? c.json(saved) : c.json({ error: NOT_FOUND }, 404);
  });

  routes.patch('/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: NOT_FOUND }, 404);
    const parsed = updateProjectRequestSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, 'Informe um título ou um status válido.');
    const updated = await c.var.store.update(id.data, parsed.data);
    return updated ? c.json(updated) : c.json({ error: NOT_FOUND }, 404);
  });

  routes.delete('/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success || !(await c.var.store.remove(id.data))) {
      return c.json({ error: NOT_FOUND }, 404);
    }
    return c.body(null, 204);
  });

  routes.get('/:id/versions', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const versions = id.success ? await c.var.store.versions(id.data) : null;
    return versions ? c.json(versions) : c.json({ error: NOT_FOUND }, 404);
  });

  routes.post('/:id/versions/:versionId/restore', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const versionId = versionIdSchema.safeParse(c.req.param('versionId'));
    const restored =
      id.success && versionId.success ? await c.var.store.restore(id.data, versionId.data) : null;
    return restored ? c.json(restored) : c.json({ error: 'Versão não encontrada.' }, 404);
  });

  return routes;
}
