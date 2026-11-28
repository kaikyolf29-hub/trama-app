import {
  applyNotebookUpdate,
  createNotebookRequestSchema,
  lessonListSchema,
  notebookContentSchema,
  notebookListSchema,
  notebookProjectSchema,
  updateNotebookRequestSchema,
  type NotebookProject,
} from '@trama/core';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { ProjectStore, StoredProject } from '../projects/store';
import type { OrganizationStore } from './store';

const idSchema = z.uuid();
const NOT_FOUND = 'Caderno não encontrado.';

type Variables = { store: ProjectStore; organization: OrganizationStore };
type Ctx = Context<{ Variables: Variables }>;

async function body(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** O projeto do banco como caderno; conteúdo `{}` (ou que não vale mais) vira o padrão. */
function toNotebook(project: StoredProject): NotebookProject {
  const content = notebookContentSchema.safeParse(project.content);
  return notebookProjectSchema.parse({
    id: project.id,
    kind: 'notebook',
    title: project.title,
    status: project.status,
    driveFileId: project.driveFileId,
    revision: project.revision,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    content: content.success ? content.data : notebookContentSchema.parse({}),
  });
}

/**
 * Rotas dos cadernos de Estudos (docs/PLAN.md, etapa 2.4): criar, listar, abrir e mudar o nome,
 * a descrição, a cor e o intervalo de revisão. Mudar o status e apagar usam as rotas de
 * `/projects/:id`; as aulas ficam em `/notebooks/:id/lessons`.
 */
export function notebookRoutes() {
  const routes = new Hono<{ Variables: Variables }>();

  routes.get('/', async (c) => {
    const notebooks = await c.var.store.listByKind('notebook');
    return c.json(notebookListSchema.parse(notebooks.map(toNotebook)));
  });

  routes.post('/', async (c) => {
    const parsed = createNotebookRequestSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'Dados do caderno inválidos.' }, 400);
    const content = notebookContentSchema.safeParse(parsed.data.content ?? {});
    if (!content.success) return c.json({ error: 'Dados do caderno inválidos.' }, 400);
    const created = await c.var.store.create({
      kind: 'notebook',
      title: parsed.data.title,
      content: content.data,
    });
    return c.json(toNotebook(created), 201);
  });

  routes.get('/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const project = id.success ? await c.var.store.get(id.data) : null;
    if (!project || project.kind !== 'notebook') return c.json({ error: NOT_FOUND }, 404);
    return c.json(toNotebook(project));
  });

  routes.patch('/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: NOT_FOUND }, 404);
    const parsed = updateNotebookRequestSchema.safeParse(await body(c));
    if (!parsed.success) {
      return c.json({ error: 'Informe um nome, uma cor ou um intervalo de revisão válidos.' }, 400);
    }
    const project = await c.var.store.get(id.data);
    if (!project || project.kind !== 'notebook') return c.json({ error: NOT_FOUND }, 404);

    const { title, ...contentPatch } = parsed.data;
    const changesContent = Object.values(contentPatch).some((value) => value !== undefined);
    if (changesContent) {
      // O conteúdo muda pela mesma gravação dos projetos (sobe a revisão e guarda a versão).
      const content = applyNotebookUpdate(toNotebook(project).content, contentPatch);
      const saved = await c.var.store.save(project.id, {
        content,
        baseRevision: project.revision,
        ...(title === undefined ? {} : { title }),
      });
      if (!saved) return c.json({ error: NOT_FOUND }, 404);
    } else if (title !== undefined && !(await c.var.store.update(project.id, { title }))) {
      return c.json({ error: NOT_FOUND }, 404);
    }
    const updated = await c.var.store.get(project.id);
    if (!updated) return c.json({ error: NOT_FOUND }, 404);
    return c.json(toNotebook(updated));
  });

  return routes;
}

/** `GET /lessons`: as aulas de todos os cadernos da pessoa (a tabela "Todas as aulas"). */
export function allLessonsRoutes() {
  const routes = new Hono<{ Variables: Variables }>();
  routes.get('/', async (c) =>
    c.json(lessonListSchema.parse(await c.var.organization.lessons.listAll())),
  );
  return routes;
}
