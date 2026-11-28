import {
  aiErrorBodySchema,
  aiOrganizeResponseSchema,
  eventListSchema,
  eventSchema,
  lessonSchema,
  profileSchema,
  projectKindSchema,
  projectStatusSchema,
  projectSummarySchema,
  projectTitleSchema,
  saveProjectResponseSchema,
  type AgendaEvent,
  type AiOrganizeRequest,
  type AiOrganizeResponse,
  type CreateAnyProjectRequest,
  type CreateLessonRequest,
  type CreateNoteRequest,
  type FlowContent,
  type Lesson,
  type ProjectStatus,
  type ProjectSummary,
  type SaveProjectResponse,
} from '@trama/core';
import { z } from 'zod';
import type { Env } from './env';

/** A API respondeu com erro. `message` é uma frase em português, pronta para a IA contar à pessoa. */
export class TramaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TramaApiError';
  }
}

/** Um projeto como a API devolve: o conteúdo só é validado por quem o usa (depende do tipo). */
const apiProjectSchema = z.object({
  id: z.uuid(),
  kind: projectKindSchema,
  title: projectTitleSchema,
  status: projectStatusSchema,
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  content: z.unknown(),
});
export type ApiProject = z.infer<typeof apiProjectSchema>;

/** O que o conector usa da API do Trama, com o token da pessoa. Os testes trocam por uma falsa. */
export interface TramaApi {
  /** O fuso da pessoa (Configurações), ou `null` se a API não disse. */
  timeZone(): Promise<string | null>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ApiProject>;
  createProject(request: CreateAnyProjectRequest): Promise<ApiProject>;
  saveFlow(id: string, content: FlowContent, baseRevision: number): Promise<SaveProjectResponse>;
  setStatus(id: string, status: ProjectStatus): Promise<ProjectSummary>;
  listEvents(range: { from: string; to: string }): Promise<AgendaEvent[]>;
  addNote(note: CreateNoteRequest): Promise<AgendaEvent>;
  createLesson(notebookId: string, lesson: CreateLessonRequest): Promise<Lesson>;
  organize(request: AiOrganizeRequest): Promise<AiOrganizeResponse>;
}

type Send = (request: Request) => Promise<Response>;

const SESSION_MESSAGE =
  'A sessão deste conector com o Trama acabou. Desconecte e conecte de novo para continuar.';

/** O cliente da API: um pedido JSON por chamada, com o token da pessoa e a resposta validada. */
export function createTramaApi(send: Send, base: string, token: string): TramaApi {
  const root = base.replace(/\/+$/, '');

  async function call<S extends z.ZodType>(
    method: string,
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const response = await send(
      new Request(`${root}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? null : JSON.stringify(body),
      }),
    );
    if (!response.ok) throw await toError(response);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new TramaApiError(502, 'O Trama devolveu algo que o conector não entendeu.');
    }
    return parsed.data;
  }

  return {
    async timeZone() {
      try {
        return (await call('GET', '/account/profile', profileSchema)).timezone;
      } catch {
        return null;
      }
    },
    listProjects: () => call('GET', '/projects', z.array(projectSummarySchema)),
    getProject: (id) => call('GET', `/projects/${encodeURIComponent(id)}`, apiProjectSchema),
    createProject: (request) => call('POST', '/projects', apiProjectSchema, request),
    saveFlow: (id, content, baseRevision) =>
      call('PUT', `/projects/${encodeURIComponent(id)}`, saveProjectResponseSchema, {
        content,
        baseRevision,
      }),
    setStatus: (id, status) =>
      call('PATCH', `/projects/${encodeURIComponent(id)}`, projectSummarySchema, { status }),
    listEvents: ({ from, to }) =>
      call(
        'GET',
        `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        eventListSchema,
      ),
    addNote: (note) => call('POST', '/events', eventSchema, note),
    createLesson: (notebookId, lesson) =>
      call('POST', `/notebooks/${encodeURIComponent(notebookId)}/lessons`, lessonSchema, lesson),
    organize: (request) => call('POST', '/ai/organize', aiOrganizeResponseSchema, request),
  };
}

/** Traduz a resposta de erro da API (`{ error, code? }`) numa frase para a pessoa. */
async function toError(response: Response): Promise<TramaApiError> {
  if (response.status === 401) return new TramaApiError(401, SESSION_MESSAGE);
  let text = '';
  let code: string | undefined;
  try {
    const body = aiErrorBodySchema.safeParse(await response.json());
    if (body.success) {
      text = body.data.error;
      code = body.data.code;
    }
  } catch {
    // Corpo que não é JSON: cai na frase padrão.
  }
  if (!text) {
    text =
      response.status === 404
        ? 'Não encontrei isso no Trama.'
        : 'O Trama não conseguiu responder agora. Tente de novo em instantes.';
  }
  return new TramaApiError(response.status, text, code);
}

/** O endereço da API e a função que chama: o service binding, ou o endereço público (`pnpm dev`). */
export function apiTransport(env: Env, fetcher: typeof fetch): { send: Send; base: string } {
  if (env.TRAMA_API) {
    const binding = env.TRAMA_API;
    // Pelo service binding o endereço só precisa ser uma URL válida; o nome do host não é usado.
    return {
      send: (request) => binding.fetch(request),
      base: 'https://trama-api',
    };
  }
  if (env.TRAMA_API_URL) return { send: (request) => fetcher(request), base: env.TRAMA_API_URL };
  throw new Error('Faltam o service binding TRAMA_API ou a variável TRAMA_API_URL no Worker.');
}
