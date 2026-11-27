-- Projetos e histórico de versões (etapa 1.5). Cada pessoa só lê e grava os próprios.
-- Gravar passa pela função save_project: numa transação só, guarda a versão anterior
-- quando há conflito (ou de 10 em 10 minutos) e sobe a revisão.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('flow', 'script', 'notebook')),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'done')),
  content jsonb not null check (pg_column_size(content) <= 5242880), -- até 5 MB
  drive_file_id text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is 'Fluxos, roteiros e cadernos. content segue @trama/core (validado na API).';

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

alter table public.projects enable row level security;

create policy "projects: cada pessoa lê os próprios"
  on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "projects: cada pessoa cria para si"
  on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "projects: cada pessoa muda os próprios"
  on public.projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "projects: cada pessoa apaga os próprios"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()));

create table public.project_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  revision integer not null,
  content jsonb not null,
  reason text not null check (reason in ('autosave', 'conflict', 'restore')),
  saved_at timestamptz not null default now()
);

comment on table public.project_versions is 'Versões anteriores de um projeto, para voltar atrás ou resolver conflito.';

create index project_versions_project_saved_idx
  on public.project_versions (project_id, saved_at desc);
create index project_versions_owner_idx on public.project_versions (owner_id);

alter table public.project_versions enable row level security;

create policy "project_versions: cada pessoa lê as próprias"
  on public.project_versions for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "project_versions: cada pessoa guarda as próprias"
  on public.project_versions for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

create policy "project_versions: cada pessoa apaga as próprias"
  on public.project_versions for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Ninguém sem login mexe nas tabelas, nem com a RLS (cinto e suspensório).
revoke all on public.projects, public.project_versions from anon;

/*
 * Salva o conteúdo. p_base_revision é a revisão em que o site se baseou: se o projeto mudou
 * desde então, vale esta gravação (a mais nova) e a anterior vai para o histórico como
 * 'conflict'. Sem conflito, uma foto 'autosave' sai de 10 em 10 minutos.
 */
create function public.save_project(
  p_id uuid,
  p_content jsonb,
  p_base_revision integer,
  p_title text default null
)
returns table (revision integer, updated_at timestamptz, overwrote boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  last_saved timestamptz;
  conflict boolean;
begin
  select * into current_project from public.projects p where p.id = p_id for update;
  if not found then
    raise exception 'projeto não encontrado' using errcode = 'P0002';
  end if;

  conflict := current_project.revision <> p_base_revision;
  if conflict then
    insert into public.project_versions (project_id, owner_id, revision, content, reason)
    values (p_id, current_project.owner_id, current_project.revision, current_project.content, 'conflict');
  else
    select max(v.saved_at) into last_saved from public.project_versions v where v.project_id = p_id;
    if last_saved is null or last_saved < now() - interval '10 minutes' then
      insert into public.project_versions (project_id, owner_id, revision, content, reason)
      values (p_id, current_project.owner_id, current_project.revision, current_project.content, 'autosave');
    end if;
  end if;

  -- Cada projeto guarda as 50 versões mais novas; as mais antigas saem.
  delete from public.project_versions v
  where v.project_id = p_id
    and v.id not in (
      select k.id from public.project_versions k
      where k.project_id = p_id
      order by k.saved_at desc, k.id desc
      limit 50
    );

  return query
    update public.projects p
    set content = p_content,
        title = coalesce(nullif(btrim(p_title), ''), p.title),
        revision = current_project.revision + 1,
        updated_at = now()
    where p.id = p_id
    returning p.revision, p.updated_at, conflict;
end;
$$;

/* Volta para uma versão antiga; o estado de agora fica guardado como 'restore'. */
create function public.restore_project_version(p_id uuid, p_version bigint)
returns table (revision integer, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  old_content jsonb;
begin
  select * into current_project from public.projects p where p.id = p_id for update;
  if not found then
    raise exception 'projeto não encontrado' using errcode = 'P0002';
  end if;
  select v.content into old_content
  from public.project_versions v
  where v.id = p_version and v.project_id = p_id;
  if not found then
    raise exception 'versão não encontrada' using errcode = 'P0002';
  end if;

  insert into public.project_versions (project_id, owner_id, revision, content, reason)
  values (p_id, current_project.owner_id, current_project.revision, current_project.content, 'restore');
  -- Cada projeto guarda as 50 versões mais novas; as mais antigas saem.
  delete from public.project_versions v
  where v.project_id = p_id
    and v.id not in (
      select k.id from public.project_versions k
      where k.project_id = p_id
      order by k.saved_at desc, k.id desc
      limit 50
    );

  return query
    update public.projects p
    set content = old_content, revision = current_project.revision + 1, updated_at = now()
    where p.id = p_id
    returning p.revision, p.updated_at;
end;
$$;

revoke execute on function public.save_project(uuid, jsonb, integer, text) from public, anon;
revoke execute on function public.restore_project_version(uuid, bigint) from public, anon;
grant execute on function public.save_project(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.restore_project_version(uuid, bigint) to authenticated;
