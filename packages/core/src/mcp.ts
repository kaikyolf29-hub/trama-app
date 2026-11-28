import { z } from 'zod';
import { clipText } from './ai-flow';
import { dateTimeSchema } from './status';

/**
 * Conector MCP (etapa 3.4, docs/PLAN.md, "Conector MCP do Trama"): o que o Worker `apps/mcp` e o
 * site compartilham. Aqui ficam as permissões, a tela de consentimento, a lista de conectores
 * de Configurações → Conectores e o texto que cada escrita deixa na Agenda. As ferramentas em si
 * (entradas, saídas e a montagem de blocos e setas) estão em `mcp-tools.ts`.
 */

/* -------------------------------------------------------------------------------------------- */
/* Permissões                                                                                    */
/* -------------------------------------------------------------------------------------------- */

/** Os nomes dos escopos OAuth. Leitura sempre vem junto; escrita é a pessoa quem dá. */
export const MCP_SCOPE_READ = 'trama:read';
export const MCP_SCOPE_WRITE = 'trama:write';

export const mcpScopeSchema = z.enum([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);
export type McpScope = z.infer<typeof mcpScopeSchema>;

export const MCP_SCOPES: readonly McpScope[] = mcpScopeSchema.options;

/** Nome que a tela usa para cada permissão. */
export const mcpScopeLabels: Record<McpScope, string> = {
  [MCP_SCOPE_READ]: 'Leitura',
  [MCP_SCOPE_WRITE]: 'Escrita',
};

/** Uma frase sobre o que cada permissão deixa fazer. */
export const mcpScopeHints: Record<McpScope, string> = {
  [MCP_SCOPE_READ]: 'Ver os seus projetos, fluxos, roteiros e a Agenda.',
  [MCP_SCOPE_WRITE]:
    'Criar fluxos, roteiros e aulas e marcar etapas como concluídas. Nunca apaga nada.',
};

/**
 * As permissões que um pedido de autorização vale. Leitura sempre entra (sem ela nada funciona).
 * Escrita entra quando o cliente a pediu, ou quando não pediu nenhuma (muitos clientes não
 * mandam `scope`): a pessoa vê as duas na tela e pode tirar a escrita. Nomes desconhecidos
 * (`offline_access`, `openid`) são ignorados.
 */
export function parseMcpScopes(requested: readonly string[]): McpScope[] {
  const known = requested.filter(
    (scope): scope is McpScope => mcpScopeSchema.safeParse(scope).success,
  );
  const wantsWrite = known.includes(MCP_SCOPE_WRITE) || known.length === 0;
  return wantsWrite ? [MCP_SCOPE_READ, MCP_SCOPE_WRITE] : [MCP_SCOPE_READ];
}

/** A conexão tem todas as permissões de `needed`? Escrita, sozinha, não vale: leitura é a base. */
export function hasMcpScopes(granted: readonly string[], needed: readonly McpScope[]): boolean {
  return needed.every((scope) => granted.includes(scope));
}

/** O que a pessoa marcou na tela: leitura sempre, escrita só se ela deixou ligada. */
export function approvedMcpScopes(chosen: readonly McpScope[]): McpScope[] {
  return chosen.includes(MCP_SCOPE_WRITE) ? [MCP_SCOPE_READ, MCP_SCOPE_WRITE] : [MCP_SCOPE_READ];
}

/** As nove ferramentas do plano. Apagar não é ferramenta (decisão da etapa 3.4). */
export const mcpToolNames = [
  'listar_projetos',
  'ler_fluxo',
  'criar_fluxo',
  'adicionar_blocos',
  'marcar_concluido',
  'organizar_texto',
  'criar_roteiro',
  'registrar_estudo',
  'buscar_agenda',
] as const;
export const mcpToolNameSchema = z.enum(mcpToolNames);
export type McpToolName = z.infer<typeof mcpToolNameSchema>;

/** A permissão de cada ferramenta (a coluna "Permissão" do plano). */
export const mcpToolScopes: Record<McpToolName, McpScope> = {
  listar_projetos: MCP_SCOPE_READ,
  ler_fluxo: MCP_SCOPE_READ,
  buscar_agenda: MCP_SCOPE_READ,
  criar_fluxo: MCP_SCOPE_WRITE,
  adicionar_blocos: MCP_SCOPE_WRITE,
  marcar_concluido: MCP_SCOPE_WRITE,
  organizar_texto: MCP_SCOPE_WRITE,
  criar_roteiro: MCP_SCOPE_WRITE,
  registrar_estudo: MCP_SCOPE_WRITE,
};

/** As permissões que uma ferramenta pede: leitura e, nas que escrevem, também a escrita. */
export function mcpToolRequiredScopes(tool: McpToolName): McpScope[] {
  return mcpToolScopes[tool] === MCP_SCOPE_WRITE
    ? [MCP_SCOPE_READ, MCP_SCOPE_WRITE]
    : [MCP_SCOPE_READ];
}

/* -------------------------------------------------------------------------------------------- */
/* Consentimento (a tela do site) e Configurações → Conectores                                   */
/* -------------------------------------------------------------------------------------------- */

/**
 * O bilhete assinado que leva o pedido de autorização do Worker MCP até a tela do site e de
 * volta. Texto opaco para o site; o Worker confere a assinatura e a validade (10 minutos).
 */
export const mcpConsentTicketSchema = z.string().min(1).max(4096);

/** `GET /connect/info?ticket=...`: o que a tela mostra antes de a pessoa decidir. */
export const mcpConsentInfoSchema = z.object({
  /** Nome que o cliente deu a si mesmo (qualquer um pode escolher: a tela mostra o endereço também). */
  clientName: z.string().min(1).max(200),
  /** Domínio verificado, quando o cliente prova quem é por um documento no próprio site. */
  clientDomain: z.string().max(253).nullable(),
  /** Para onde o cliente vai receber a autorização: o endereço de retorno. */
  redirectHost: z.string().min(1).max(300),
  /** O retorno vai para um app do próprio computador (localhost): a tela avisa. */
  redirectIsLoopback: z.boolean(),
  /** As permissões que o cliente pediu. */
  scopes: z.array(mcpScopeSchema).min(1),
  expiresAt: dateTimeSchema,
});
export type McpConsentInfo = z.infer<typeof mcpConsentInfoSchema>;

/**
 * `POST /connect/decision`. Permitir leva as permissões que a pessoa deixou marcadas e o
 * refresh token de uma sessão nova do Supabase (aberta na própria tela, com a senha, só para o
 * conector: a sessão do site nunca é emprestada). O token de acesso dessa sessão vai no cabeçalho.
 */
export const mcpConsentDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('deny'), ticket: mcpConsentTicketSchema }),
  z.object({
    decision: z.literal('allow'),
    ticket: mcpConsentTicketSchema,
    scopes: z.array(mcpScopeSchema).min(1),
    refreshToken: z.string().min(1).max(4096),
  }),
]);
export type McpConsentDecision = z.infer<typeof mcpConsentDecisionSchema>;

/** A resposta: para onde mandar o navegador (de volta ao cliente MCP, com o código ou o erro). */
export const mcpConsentResultSchema = z.object({ redirectTo: z.string().min(1).max(4096) });
export type McpConsentResult = z.infer<typeof mcpConsentResultSchema>;

/** Um cliente MCP autorizado, na lista de Configurações → Conectores. */
export const mcpConnectorSchema = z.object({
  /** O id da concessão: é o que se manda para revogar. */
  id: z.string().min(1).max(128),
  clientName: z.string().min(1).max(200),
  clientDomain: z.string().max(253).nullable(),
  scopes: z.array(mcpScopeSchema).min(1),
  createdAt: dateTimeSchema,
  /** A última chamada de uma ferramenta (guardada com até 10 minutos de atraso). */
  lastUsedAt: dateTimeSchema.nullable(),
});
export type McpConnector = z.infer<typeof mcpConnectorSchema>;

/** `GET /connectors`. */
export const mcpConnectorListSchema = z.object({ connectors: z.array(mcpConnectorSchema) });
export type McpConnectorList = z.infer<typeof mcpConnectorListSchema>;

/** Nome mostrado para um cliente sem nome. */
export const MCP_DEFAULT_CLIENT_NAME = 'Cliente MCP';

/** Um nome de cliente seguro para mostrar e gravar: sem espaços nas pontas e com limite. */
export function cleanClientName(name: string | undefined | null): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim();
  return clean ? clipText(clean, 80) : MCP_DEFAULT_CLIENT_NAME;
}

/* -------------------------------------------------------------------------------------------- */
/* Registro de cada escrita na Agenda                                                            */
/* -------------------------------------------------------------------------------------------- */

/**
 * Cada chamada que escreve deixa uma anotação na Agenda (`POST /events`, ligada ao projeto), com
 * o nome do cliente. Escolhemos a Agenda e não um histórico novo no projeto: ela já existe, a
 * pessoa já a lê, e a anotação (que ela pode apagar) é o único evento que a RLS deixa o MCP
 * criar com o token dela.
 */
export type McpWriteAction =
  | 'flow_created'
  | 'blocks_added'
  | 'marked_done'
  | 'text_organized'
  | 'script_created'
  | 'study_logged';

const auditVerbs: Record<McpWriteAction, string> = {
  flow_created: 'Fluxo criado',
  blocks_added: 'Blocos adicionados',
  marked_done: 'Marcado como concluído',
  text_organized: 'Texto organizado',
  script_created: 'Roteiro criado',
  study_logged: 'Estudo registrado',
};

export interface McpAuditNote {
  title: string;
  detail: string;
}

/** O texto da anotação: "Fluxo criado: Plano do vídeo", e "Pelo conector Claude" embaixo. */
export function mcpAuditNote(input: {
  clientName: string;
  action: McpWriteAction;
  /** O projeto, a etapa ou a aula afetada. */
  subject: string;
}): McpAuditNote {
  const subject = input.subject.replace(/\s+/g, ' ').trim();
  const verb = auditVerbs[input.action];
  return {
    title: subject ? `${verb}: ${clipText(subject, 150)}` : verb,
    detail: `Pelo conector ${cleanClientName(input.clientName)}`,
  };
}
