import type {
  FlowContent,
  NotebookContent,
  ProjectKind,
  ProjectStatus,
  ProjectSummary,
  ProjectVersion,
  SaveProjectRequest,
  SaveProjectResponse,
  UpdateProjectRequest,
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
  /** Os cadernos de Estudos entram por `POST /notebooks`; o fluxo, por `POST /projects`. */
  create(
    input:
      | { kind: 'flow'; title: string; content: FlowContent }
      | { kind: 'notebook'; title: string; content: NotebookContent },
  ): Promise<StoredProject>;
  /** Todos os projetos de um tipo, com o conteúdo (a lista de cadernos do Estudos). */
  listByKind(kind: ProjectKind): Promise<StoredProject[]>;
  /** Renomeia e/ou muda o status; o conteúdo e a revisão ficam como estão. */
  update(id: string, patch: UpdateProjectRequest): Promise<ProjectSummary | null>;
  /** O conteúdo já foi validado pela rota para o tipo do projeto (fluxo ou caderno). */
  save(
    id: string,
    request: Omit<SaveProjectRequest, 'content'> & { content: unknown },
  ): Promise<SaveProjectResponse | null>;
  /** Guarda o id do `projeto.trama` no Drive (não conta como mudança no projeto). */
  setDriveFileId(id: string, driveFileId: string): Promise<void>;
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
