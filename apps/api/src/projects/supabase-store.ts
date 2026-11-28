import { createClient } from '@supabase/supabase-js';
import type { ProjectKind, ProjectStatus, ProjectVersion, VersionReason } from '@trama/core';
import { SessionError, type ProjectStore, type StoredProject } from './store';

interface ProjectRow {
  id: string;
  kind: ProjectKind;
  title: string;
  status: ProjectStatus;
  revision: number;
  drive_file_id: string | null;
  created_at: string;
  updated_at: string;
  content?: unknown;
}

export interface PostgrestError {
  code?: string;
  message: string;
}

/** O Postgres manda microssegundos e "+00:00"; a API devolve ISO em UTC. */
export function iso(value: string): string {
  return new Date(value).toISOString();
}

function toProject(row: ProjectRow): StoredProject {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    revision: row.revision,
    driveFileId: row.drive_file_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    content: row.content,
  };
}

/** Token vencido ou falso vira SessionError (401); "não achou" vira null; o resto é erro. */
export function check(error: PostgrestError | null, status?: number): void {
  if (!error) return;
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') {
    throw new SessionError();
  }
  throw new Error(`Supabase: ${error.code ?? ''} ${error.message}`);
}

/** Primeira linha que uma função do banco devolveu (elas devolvem uma tabela de uma linha). */
function firstRow<T extends { revision: number; updated_at: string }>(data: unknown): T | null {
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (typeof row !== 'object' || row === null) return null;
  const { revision, updated_at } = row as Record<string, unknown>;
  return typeof revision === 'number' && typeof updated_at === 'string' ? (row as T) : null;
}

const SUMMARY = 'id, kind, title, status, revision, updated_at';
const FULL = 'id, kind, title, status, revision, drive_file_id, created_at, updated_at, content';

/**
 * Projetos no Supabase, com a chave publicável e o token da pessoa: o banco aplica a RLS
 * como se fosse ela. A API não precisa da chave secreta para isso.
 */
export function createSupabaseStore(
  url: string,
  publishableKey: string,
  token: string,
): ProjectStore {
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    async list() {
      const { data, error, status } = await supabase
        .from('projects')
        .select(SUMMARY)
        .order('updated_at', { ascending: false })
        .limit(500)
        .returns<ProjectRow[]>();
      check(error, status);
      return (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        status: row.status,
        revision: row.revision,
        updatedAt: iso(row.updated_at),
      }));
    },

    async get(id) {
      const { data, error, status } = await supabase
        .from('projects')
        .select(FULL)
        .eq('id', id)
        .returns<ProjectRow[]>()
        .maybeSingle();
      check(error, status);
      return data ? toProject(data) : null;
    },

    async kindOf(id) {
      const { data, error, status } = await supabase
        .from('projects')
        .select('kind')
        .eq('id', id)
        .returns<{ kind: ProjectKind }[]>()
        .maybeSingle();
      check(error, status);
      return data?.kind ?? null;
    },

    async create({ kind, title, content }) {
      const { data, error, status } = await supabase
        .from('projects')
        .insert({ kind, title, content })
        .select(FULL)
        .returns<ProjectRow[]>()
        .single();
      check(error, status);
      if (!data) throw new Error('Supabase não devolveu o projeto criado');
      return toProject(data);
    },

    async update(id, { title, status }) {
      // Sem gatilho no banco para `updated_at`: renomear ou mudar o status conta como editar.
      // A revisão não sobe, para o salvamento aberto em outra aba não virar conflito.
      const {
        data,
        error,
        status: httpStatus,
      } = await supabase
        .from('projects')
        .update({
          ...(title === undefined ? {} : { title }),
          ...(status === undefined ? {} : { status }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(SUMMARY)
        .returns<ProjectRow[]>();
      check(error, httpStatus);
      const row = data?.[0];
      if (!row) return null;
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        status: row.status,
        revision: row.revision,
        updatedAt: iso(row.updated_at),
      };
    },

    async save(id, { content, title, baseRevision }) {
      const result = await supabase.rpc('save_project', {
        p_id: id,
        p_content: content,
        p_base_revision: baseRevision,
        ...(title ? { p_title: title } : {}),
      });
      const { error, status } = result;
      const data: unknown = result.data;
      if (error?.code === 'P0002') return null;
      check(error, status);
      const row = firstRow<{ revision: number; updated_at: string; overwrote: boolean }>(data);
      if (!row) return null;
      return { revision: row.revision, updatedAt: iso(row.updated_at), overwrote: row.overwrote };
    },

    async setDriveFileId(id, driveFileId) {
      // Não passa pelo save_project: guardar o id do arquivo não sobe a revisão nem a data.
      const { error, status } = await supabase
        .from('projects')
        .update({ drive_file_id: driveFileId })
        .eq('id', id);
      check(error, status);
    },

    async remove(id) {
      const { data, error, status } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
        .select('id')
        .returns<{ id: string }[]>();
      check(error, status);
      return (data ?? []).length > 0;
    },

    async versions(id) {
      if (!(await this.get(id))) return null;
      const { data, error, status } = await supabase
        .from('project_versions')
        .select('id, revision, reason, saved_at')
        .eq('project_id', id)
        .order('saved_at', { ascending: false })
        .returns<{ id: number; revision: number; reason: VersionReason; saved_at: string }[]>();
      check(error, status);
      return (data ?? []).map((row): ProjectVersion => ({
        id: row.id,
        revision: row.revision,
        reason: row.reason,
        savedAt: iso(row.saved_at),
      }));
    },

    async restore(id, versionId) {
      const result = await supabase.rpc('restore_project_version', {
        p_id: id,
        p_version: versionId,
      });
      const { error, status } = result;
      const data: unknown = result.data;
      if (error?.code === 'P0002') return null;
      check(error, status);
      const row = firstRow<{ revision: number; updated_at: string }>(data);
      return row ? { revision: row.revision, updatedAt: iso(row.updated_at) } : null;
    },
  };
}
