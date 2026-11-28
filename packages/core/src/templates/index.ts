import { z } from 'zod';
import type { CreateAnyProjectRequest, CreateProjectRequest } from '../api';
import {
  createEmptyFlow,
  flowContentSchema,
  type FlowContent,
  type FlowContentInput,
} from '../flow';
import type { ProjectKind } from '../project';
import type { ScriptContent } from '../script';
import { lessonTemplateContent } from './lesson';
import { planTemplateContent } from './plan';
import { scriptTemplateContent } from './script';
import { scriptDocTemplateContent } from './script-doc';
import { videoTemplateContent } from './video';
import { voiceTemplateContent } from './voice';

/**
 * Modelos de início (docs/PLAN.md, "Modelos de início" e tela 4): cada um é um fluxo válido,
 * montado na grade de 8 px, que a pessoa escolhe na tela Início para não começar do zero.
 */
export const flowTemplateIdSchema = z.enum(['blank', 'lesson', 'video', 'plan', 'script', 'voice']);
export type FlowTemplateId = z.infer<typeof flowTemplateIdSchema>;

export interface FlowTemplate {
  id: FlowTemplateId;
  /** Nome do cartão na tela Início. */
  title: string;
  /** Uma linha que diz o que o modelo traz. */
  description: string;
  /**
   * Tipo do projeto criado. Todos os modelos de hoje criam um fluxo: o roteiro é, por enquanto,
   * a versão em quadro (cenas como cartões); os roteiros em texto são da V1.
   */
  kind: Extract<ProjectKind, 'flow'>;
  /** Título que o projeto novo recebe (a pessoa renomeia depois). */
  projectTitle: string;
  /** O conteúdo inicial: um fluxo novo e validado a cada chamada (nunca compartilhado). */
  content: () => FlowContent;
}

function template(
  fields: Omit<FlowTemplate, 'content' | 'kind'>,
  source: () => FlowContentInput,
): FlowTemplate {
  return { ...fields, kind: 'flow', content: () => flowContentSchema.parse(source()) };
}

/** Os modelos, na ordem da tela 4. */
export const flowTemplates: readonly FlowTemplate[] = [
  template(
    {
      id: 'blank',
      title: 'Fluxo em branco',
      description: 'Quadro infinito, você monta do zero',
      projectTitle: 'Sem título',
    },
    createEmptyFlow,
  ),
  template(
    {
      id: 'lesson',
      title: 'Aula por etapas',
      description: 'Blocos que aparecem um de cada vez',
      projectTitle: 'Aula por etapas',
    },
    () => lessonTemplateContent,
  ),
  template(
    {
      id: 'video',
      title: 'Fluxo de vídeo',
      description: 'Tema, thumbnail, vídeo, texto e “vídeo pronto”',
      projectTitle: 'Fluxo de vídeo',
    },
    () => videoTemplateContent,
  ),
  template(
    {
      id: 'plan',
      title: 'Plano de projeto',
      description: 'Etapas, decisões e tarefas',
      projectTitle: 'Plano de projeto',
    },
    () => planTemplateContent,
  ),
  template(
    {
      id: 'script',
      title: 'Roteiro de vídeo',
      description: 'Cenas, falas e B-roll em sequência',
      projectTitle: 'Roteiro de vídeo',
    },
    () => scriptTemplateContent,
  ),
  template(
    {
      id: 'voice',
      title: 'Falar e organizar',
      description: 'Fale à vontade, a IA monta o fluxo',
      projectTitle: 'Sem título',
    },
    () => voiceTemplateContent,
  ),
];

export function getFlowTemplate(id: FlowTemplateId): FlowTemplate {
  const found = flowTemplates.find((item) => item.id === id);
  if (!found) throw new Error(`modelo inexistente: ${id}`);
  return found;
}

/** O pedido de criar projeto (`POST /projects`) que parte do modelo. */
export function createProjectRequestFromTemplate(template: FlowTemplate): CreateProjectRequest {
  return { kind: template.kind, title: template.projectTitle, content: template.content() };
}

/** O "Roteiro de vídeo" da tela Início quando cria um roteiro em texto (etapa 2.3). */
export interface ScriptTemplate {
  id: 'script';
  title: string;
  description: string;
  kind: 'script';
  projectTitle: string;
  /** Um roteiro novo (ids novos) a cada chamada. */
  content: () => ScriptContent;
}

export const scriptTemplate: ScriptTemplate = {
  id: 'script',
  title: 'Roteiro de vídeo',
  description: 'Cenas, falas e B-roll em sequência',
  kind: 'script',
  projectTitle: 'Roteiro de vídeo',
  content: scriptDocTemplateContent,
};

/** Modelo da tela Início: cria um fluxo ou, no caso do roteiro, um projeto `script`. */
export type ProjectTemplate = FlowTemplate | ScriptTemplate;

/**
 * Os modelos da tela Início, na ordem da tela 4. É a lista de `flowTemplates` com o "Roteiro de
 * vídeo" criando um roteiro em texto (tela 3); a versão em quadro dele continua em
 * `flowTemplates`.
 */
export const projectTemplates: readonly ProjectTemplate[] = flowTemplates.map(
  (item): ProjectTemplate => (item.id === 'script' ? scriptTemplate : item),
);

/** O pedido de criar projeto (`POST /projects`) que parte de um modelo da tela Início. */
export function createRequestFromProjectTemplate(
  template: ProjectTemplate,
): CreateAnyProjectRequest {
  return template.kind === 'script'
    ? { kind: 'script', title: template.projectTitle, content: template.content() }
    : { kind: 'flow', title: template.projectTitle, content: template.content() };
}
