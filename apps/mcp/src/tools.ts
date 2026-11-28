import {
  DEFAULT_REVIEW_AFTER_DAYS,
  DEFAULT_TIME_ZONE,
  McpInputError,
  addBlocksInputSchema,
  addBlocksOutputSchema,
  agendaInputSchema,
  agendaOutputSchema,
  agendaWindow,
  appendToFlow,
  buildFlowFromMcp,
  buildLessonRequest,
  buildScriptWithFlow,
  createFlowInputSchema,
  createFlowOutputSchema,
  createScriptInputSchema,
  createScriptOutputSchema,
  filterProjects,
  flowContentSchema,
  hasMcpScopes,
  listProjectsInputSchema,
  listProjectsOutputSchema,
  markDoneInFlow,
  markDoneInputSchema,
  markDoneOutputSchema,
  mcpAuditNote,
  mcpToolRequiredScopes,
  notebookContentSchema,
  organizeInputSchema,
  organizeOutputSchema,
  organizedToFlow,
  projectUrl,
  promptOutputToText,
  readFlowInputSchema,
  readFlowOutputSchema,
  studyInputSchema,
  studyOutputSchema,
  summarizeAgenda,
  summarizeFlow,
  aiSuggestedTitle,
  type McpProjectRef,
  type McpToolName,
  type McpWriteAction,
  type ProjectStatus,
  type ProjectSummary,
} from '@trama/core';
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { TramaApiError, type ApiProject, type TramaApi } from './trama-api';

/** Tudo o que as ferramentas usam de fora: a API da pessoa, o que o cliente pode e o relógio. */
export interface ToolContext {
  api: TramaApi;
  /** As permissões da concessão (`trama:read`, `trama:write`). */
  scopes: readonly string[];
  /** O nome do cliente MCP (vai para a Agenda, em cada escrita). */
  clientName: string;
  /** O endereço do site, para os links dos projetos. */
  appUrl: string | undefined;
  now: () => Date;
}

const INSTRUCTIONS = [
  'Conector do Trama, um quadro visual para montar fluxos de vídeo, aulas, planos e roteiros.',
  'Comece por `listar_projetos` para achar o id do que a pessoa citou. `ler_fluxo` com formato "summary" mostra os ids dos blocos de um fluxo grande.',
  'Para criar ou ampliar um fluxo, dê um nome curto (`ref`) a cada bloco e ligue-os em `links`; as respostas devolvem o id de cada nome.',
  'Esta conexão nunca apaga nada. Escrever exige a permissão de escrita que a pessoa deu ao conectar; sem ela, as ferramentas de escrita falham.',
  'Cada escrita deixa uma anotação na Agenda da pessoa com o seu nome. Fale com a pessoa em português do Brasil.',
].join('\n');

const text = (output: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(output) }],
  structuredContent: output,
});

const failure = (message: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

const GENERIC_FAILURE = 'O Trama não conseguiu fazer isso agora. Tente de novo em instantes.';

/** Uma frase para a IA (e a pessoa) a partir do erro; o que não se espera vira frase genérica. */
function describeError(tool: string, error: unknown): string {
  if (error instanceof McpInputError) return error.message;
  if (error instanceof TramaApiError) {
    if (error.status >= 500) console.error(`${tool}: a API respondeu ${String(error.status)}`);
    return error.message;
  }
  // Só o nome do erro vai para o log: a mensagem pode ter dados da pessoa.
  console.error(`${tool}: erro inesperado`, error instanceof Error ? error.name : typeof error);
  return GENERIC_FAILURE;
}

type Output<S extends z.ZodType> = z.infer<S>;

/** Cria o servidor MCP com as nove ferramentas, para uma pessoa e um cliente. */
export function createTramaServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: 'trama', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  const { api } = ctx;

  let zone: Promise<string> | undefined;
  const timeZone = () => (zone ??= api.timeZone().then((value) => value ?? DEFAULT_TIME_ZONE));

  const ref = (
    project: Pick<ApiProject, 'id' | 'kind' | 'title'> & { revision?: number },
  ): McpProjectRef => ({
    id: project.id,
    kind: project.kind,
    title: project.title,
    url: projectUrl(ctx.appUrl, project.id),
    ...(project.revision === undefined ? {} : { revision: project.revision }),
  });

  /** Deixa a anotação na Agenda. Nunca derruba a ferramenta: a escrita já aconteceu. */
  async function audit(action: McpWriteAction, subject: string, projectId?: string) {
    try {
      const note = mcpAuditNote({ clientName: ctx.clientName, action, subject });
      await api.addNote({ ...note, ...(projectId ? { projectId } : {}) });
    } catch (error) {
      console.warn(
        'a anotação da Agenda não foi gravada',
        error instanceof TramaApiError ? error.status : '',
      );
    }
  }

  async function flowOf(
    id: string,
  ): Promise<{ project: ApiProject; content: z.infer<typeof flowContentSchema> }> {
    const project = await api.getProject(id);
    if (project.kind !== 'flow') {
      throw new McpInputError(
        `"${project.title}" é um ${project.kind === 'script' ? 'roteiro' : 'caderno'}, não um fluxo.`,
      );
    }
    const content = flowContentSchema.safeParse(project.content);
    if (!content.success) {
      throw new McpInputError(
        `O fluxo "${project.title}" tem um conteúdo que o Trama não entende.`,
      );
    }
    return { project, content: content.data };
  }

  /**
   * Registra uma ferramenta. A permissão é conferida aqui também, mesmo com o Worker já barrando
   * antes (`insufficientScope`): é o que garante que leitura nunca escreve.
   */
  function tool<I extends z.ZodType, O extends z.ZodType>(
    name: McpToolName,
    config: {
      title: string;
      description: string;
      input: I;
      output: O;
    },
    run: (input: Output<I>) => Promise<Output<O>>,
  ) {
    const required = mcpToolRequiredScopes(name);
    const writes = required.length > 1;
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        inputSchema: config.input as never,
        outputSchema: config.output as never,
        annotations: {
          readOnlyHint: !writes,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (async (input: Output<I>) => {
        if (!hasMcpScopes(ctx.scopes, required)) {
          return failure(
            'Esta conexão só tem permissão de leitura. Para escrever, desconecte e conecte de novo, dando a permissão de escrita.',
          );
        }
        try {
          return text(await run(input));
        } catch (error) {
          return failure(describeError(name, error));
        }
      }) as never,
    );
  }

  tool(
    'listar_projetos',
    {
      title: 'Listar projetos',
      description:
        'Lista os fluxos, roteiros e cadernos da pessoa, do mais recente ao mais antigo, com filtro por tipo, status, título e data da última mudança.',
      input: listProjectsInputSchema,
      output: listProjectsOutputSchema,
    },
    async (input) => {
      const [all, zoneName] = await Promise.all([api.listProjects(), timeZone()]);
      const { projects, total } = filterProjects(all, input, zoneName);
      return {
        total,
        projects: projects.map((project: ProjectSummary) => ({
          ...project,
          url: projectUrl(ctx.appUrl, project.id),
        })),
      };
    },
  );

  tool(
    'ler_fluxo',
    {
      title: 'Ler um fluxo',
      description:
        'Devolve um fluxo com blocos, molduras e setas em JSON. Use format "summary" para uma lista curta (com os ids dos blocos) quando o fluxo for grande.',
      input: readFlowInputSchema,
      output: readFlowOutputSchema,
    },
    async (input) => {
      const { project, content } = await flowOf(input.projectId);
      const summary = {
        id: project.id,
        kind: project.kind,
        title: project.title,
        status: project.status,
        revision: project.revision,
        updatedAt: project.updatedAt,
        url: projectUrl(ctx.appUrl, project.id),
      };
      return input.format === 'summary'
        ? { project: summary, summary: summarizeFlow(content) }
        : { project: summary, content };
    },
  );

  tool(
    'criar_fluxo',
    {
      title: 'Criar um fluxo',
      description:
        'Cria um fluxo novo a partir de um título e de uma lista de blocos (texto, cartão, nota adesiva, forma, etapas) e ligações. Dê um `ref` a cada bloco e ligue-os em `links`. O quadro posiciona os blocos.',
      input: createFlowInputSchema,
      output: createFlowOutputSchema,
    },
    async (input) => {
      const { content, refs } = buildFlowFromMcp(input);
      const project = await api.createProject({ kind: 'flow', title: input.title, content });
      await audit('flow_created', project.title, project.id);
      return {
        project: ref(project),
        counts: {
          blocks: content.blocks.length,
          frames: content.frames.length,
          arrows: content.arrows.length,
        },
        refs,
      };
    },
  );

  tool(
    'adicionar_blocos',
    {
      title: 'Adicionar blocos a um fluxo',
      description:
        'Adiciona blocos, grupos e setas a um fluxo que já existe, embaixo do que já está no quadro. Uma seta pode ligar um bloco novo a um bloco ou moldura que já existia (use o id dele; veja `ler_fluxo`).',
      input: addBlocksInputSchema,
      output: addBlocksOutputSchema,
    },
    async (input) => {
      const { project, content } = await flowOf(input.projectId);
      const next = appendToFlow(content, input);
      const saved = await api.saveFlow(project.id, next.content, project.revision);
      await audit('blocks_added', project.title, project.id);
      return {
        project: ref({ ...project, revision: saved.revision }),
        added: next.added,
        refs: next.refs,
      };
    },
  );

  tool(
    'marcar_concluido',
    {
      title: 'Marcar como concluído',
      description:
        'Marca (ou desmarca) o selo de um cartão, como "Vídeo pronto", uma etapa de uma lista ou todas as etapas dela. Sem `blockId`, marca o projeto inteiro como concluído. Registra na Agenda.',
      input: markDoneInputSchema,
      output: markDoneOutputSchema,
    },
    async (input) => {
      if (input.blockId === undefined) {
        const status: ProjectStatus = input.done ? 'done' : 'in_progress';
        const updated = await api.setStatus(input.projectId, status);
        await audit('marked_done', updated.title, updated.id);
        return { project: ref(updated), label: updated.title, done: input.done, status };
      }
      const { project, content } = await flowOf(input.projectId);
      const marked = markDoneInFlow(
        content,
        { blockId: input.blockId, itemId: input.itemId, done: input.done },
        ctx.now(),
      );
      const saved = await api.saveFlow(project.id, marked.content, project.revision);
      await audit('marked_done', `${marked.label} · ${project.title}`, project.id);
      return {
        project: ref({ ...project, revision: saved.revision }),
        label: marked.label,
        done: input.done,
      };
    },
  );

  tool(
    'organizar_texto',
    {
      title: 'Organizar um texto',
      description:
        'Organiza um texto (uma fala, uma ideia solta) em fluxo, plano com tarefas ou prompt, com a IA e a chave que a própria pessoa configurou no Trama (o uso é cobrado na conta dela). Com `saveAsFlow`, já cria o fluxo.',
      input: organizeInputSchema,
      output: organizeOutputSchema,
    },
    async (input) => {
      if (input.saveAsFlow && input.format === 'prompt') {
        throw new McpInputError('O formato "prompt" não vira fluxo. Use "flow" ou "plan".');
      }
      const result = await api.organize({ text: input.text, format: input.format });
      const flow = input.saveAsFlow ? organizedToFlow(result) : null;
      const project = flow
        ? await api.createProject({ kind: 'flow', title: flow.title, content: flow.content })
        : null;
      await audit(
        'text_organized',
        project?.title ?? aiSuggestedTitle(result.output.title),
        project?.id,
      );
      return {
        result,
        ...(result.format === 'prompt' ? { promptText: promptOutputToText(result.output) } : {}),
        project: project ? ref(project) : null,
      };
    },
  );

  tool(
    'criar_roteiro',
    {
      title: 'Criar um roteiro',
      description:
        'Cria um roteiro com cenas (título, tempo, fala, B-roll e notas) e, ligado a ele, um fluxo com um cartão por cena. Com `linkFlow` falso, cria só o roteiro.',
      input: createScriptInputSchema,
      output: createScriptOutputSchema,
    },
    async (input) => {
      const built = buildScriptWithFlow(input);
      const flow = built.flow
        ? await api.createProject({ kind: 'flow', title: built.flowTitle, content: built.flow })
        : null;
      const script = await api.createProject({
        kind: 'script',
        title: input.title,
        content: { ...built.script, flowId: flow?.id ?? null },
      });
      await audit('script_created', script.title, script.id);
      return {
        script: ref(script),
        flow: flow ? ref(flow) : null,
        scenes: built.script.scenes.length,
      };
    },
  );

  tool(
    'registrar_estudo',
    {
      title: 'Registrar um estudo',
      description:
        'Cria uma aula num caderno de Estudos, já como estudada, com a data do estudo (agora, ou uma do passado) e a data da revisão. Se o caderno pedido por nome não existir, cria um.',
      input: studyInputSchema,
      output: studyOutputSchema,
    },
    async (input) => {
      let notebook: ApiProject | undefined;
      let created = false;
      if (input.notebookId) {
        notebook = await api.getProject(input.notebookId);
        if (notebook.kind !== 'notebook') {
          throw new McpInputError(`"${notebook.title}" não é um caderno de Estudos.`);
        }
      } else {
        const wanted = (input.notebookTitle ?? '').trim().toLocaleLowerCase('pt-BR');
        const found = (await api.listProjects()).find(
          (project) =>
            project.kind === 'notebook' && project.title.toLocaleLowerCase('pt-BR') === wanted,
        );
        if (found) notebook = await api.getProject(found.id);
        else {
          notebook = await api.createProject({
            kind: 'notebook',
            title: input.notebookTitle ?? 'Estudos',
          });
          created = true;
        }
      }
      const content = notebookContentSchema.safeParse(notebook.content ?? {});
      const request = buildLessonRequest(input, {
        now: ctx.now(),
        reviewAfterDays: content.success ? content.data.reviewAfterDays : DEFAULT_REVIEW_AFTER_DAYS,
        timeZone: await timeZone(),
      });
      const lesson = await api.createLesson(notebook.id, request);
      await audit('study_logged', `${lesson.title} · ${notebook.title}`, notebook.id);
      return { notebook: ref(notebook), notebookCreated: created, lesson };
    },
  );

  tool(
    'buscar_agenda',
    {
      title: 'Buscar na Agenda',
      description:
        'Diz o que foi feito num dia, numa semana (de domingo a sábado) ou num mês: projetos criados, editados e concluídos, aulas estudadas e anotações.',
      input: agendaInputSchema,
      output: agendaOutputSchema,
    },
    async (input) => {
      const zoneName = await timeZone();
      const window = agendaWindow(input, ctx.now(), zoneName);
      const events = await api.listEvents({ from: window.from, to: window.to });
      return summarizeAgenda(events, window, input.period, zoneName);
    },
  );

  return server;
}
