import type {
  FlowContent,
  ProjectKind,
  ProjectStatus,
  ProjectSummary,
  ProjectVersion,
  SaveProjectRequest,
  SaveProjectResponse,
} from '@trama/core';

/** Projeto como vem do banco; o conteúdo ainda passa pela validação antes de sair da API. */
export interface StoredProject {
  id: string;
  kind: ProjectKind;
  title: string;
  status: ProjectStatus;
  revision: number;
  driveFileId: string | null;
  createdAt: string;
  updatedAt: string;
  content: unknown;
}

/**
 * Onde os projetos moram, do ponto de vista das rotas. A versão de verdade fala com o
 * Supabase usando o token da pessoa (a RLS decide o que ela vê); os testes usam uma em memória.
 * `null` quer dizer "não existe para esta pessoa".
 */
export interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<StoredProject | null>;
  create(input: { kind: 'flow'; title: string; content: FlowContent }): Promise<StoredProject>;
  save(id: string, request: SaveProjectRequest): Promise<SaveProjectResponse | null>;
  remove(id: string): Promise<boolean>;
  versions(id: string): Promise<ProjectVersion[] | null>;
  restore(id: string, versionId: number): Promise<{ revision: number; updatedAt: string } | null>;
}

/** O token da pessoa não vale mais (expirou ou é falso). */
export class SessionError extends Error {
  constructor() {
    super('sessão inválida');
    this.name = 'SessionError';
  }
}
