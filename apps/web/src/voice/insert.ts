import {
  aiSuggestedTitle,
  appendFlowBelow,
  flowContentSchema,
  scriptContentSchema,
  type FlowContent,
  type ScriptContent,
} from '@trama/core';
import type { ProjectsApi } from '../api/projects-api';
import { shouldRename } from './organize';

/**
 * "Inserir no quadro" (etapa 3.3). Tudo passa pelo `@trama/core` antes de gravar: o fluxo da IA
 * já nasce validado (`aiOutputToFlow`), junta-se ao do projeto (`appendFlowBelow`) e a API
 * ainda confere de novo. A gravação usa a revisão que acabou de ser lida: se a pessoa editou o
 * quadro em outra aba, vale a versão mais nova e a anterior vai para o histórico (regra da API).
 */

/**
 * Junta o fluxo ao quadro do projeto, abaixo do que já existe, e grava. Devolve o título usado
 * quando o projeto ainda se chamava "Sem título" e ganhou o nome sugerido pela IA.
 */
export async function insertFlowIntoProject(
  projects: ProjectsApi,
  projectId: string,
  added: FlowContent,
  suggestedTitle: string,
): Promise<{ title: string | null }> {
  const valid = flowContentSchema.parse(added);
  const project = await projects.get(projectId);
  const merged = appendFlowBelow(project.content, valid);
  const rename = shouldRename(project.title) ? aiSuggestedTitle(suggestedTitle) : null;
  await projects.save(projectId, {
    content: merged,
    baseRevision: project.revision,
    ...(rename && rename !== 'Sem título' ? { title: rename } : {}),
  });
  return { title: rename };
}

/** Cria um projeto de roteiro com as cenas da IA e devolve o id e o título dele. */
export async function createScriptProject(
  projects: ProjectsApi,
  script: ScriptContent,
  suggestedTitle: string,
): Promise<{ id: string; title: string }> {
  const content = scriptContentSchema.parse(script);
  const created = await projects.createScript({
    kind: 'script',
    title: aiSuggestedTitle(suggestedTitle),
    content,
  });
  return { id: created.id, title: created.title };
}
