-- Aulas dos cadernos e eventos da Agenda (etapa 2.1). Cada pessoa só lê e grava as próprias.
-- Os eventos automáticos (projeto criado, editado, concluído; aula estudada ou revisada) são
-- gravados por gatilhos, para valer igual no site, na API e no MCP.

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notebook_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  notes text not null default '' check (char_length(notes) <= 20000),
  status text not null default 'studying' check (status in ('studying', 'review', 'done')),
  studied_at timestamptz,
  reviewed_at timestamptz,
  review_on date, -- só o dia da próxima revisão, sem fuso
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lessons is 'Aulas dos cadernos de Estudos: status, data estudada, data de revisão.';

create index lessons_notebook_position_idx on public.lessons (notebook_id, position, created_at);
create index lessons_owner_review_idx on public.lessons (owner_id, review_on) where review_on is not null;

alter table public.lessons enable row level security;

create policy "lessons: cada pessoa lê as próprias"
  on public.lessons for select to authenticated
  using (owner_id = (select auth.uid()));

-- A aula só entra num caderno (projeto do tipo notebook) da própria pessoa.
create policy "lessons: cada pessoa cria nos próprios cadernos"
  on public.lessons for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = notebook_id and p.owner_id = (select auth.uid()) and p.kind = 'notebook'
    )
  );

create policy "lessons: cada pessoa muda as próprias"
  on public.lessons for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.projects p
      where p.id = notebook_id and p.owner_id = (select auth.uid()) and p.kind = 'notebook'
    )
  );

create policy "lessons: cada pessoa apaga as próprias"
  on public.lessons for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.lessons from anon;

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function private.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('created', 'edited', 'completed', 'studied', 'reviewed', 'note')),
  occurred_at timestamptz not null default now(),
  -- Se o projeto ou a aula forem apagados, o evento fica (com o título guardado na hora).
  project_id uuid references public.projects (id) on delete set null,
  project_kind text check (project_kind in ('flow', 'script', 'notebook')),
  lesson_id uuid references public.lessons (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  detail text check (char_length(detail) <= 500),
  source text not null default 'manual' check (source in ('auto', 'manual')),
  created_at timestamptz not null default now(),
  -- Só a anotação é feita à mão, e toda anotação é.
  check ((type = 'note') = (source = 'manual'))
);

comment on table public.events is 'O que aconteceu e quando; alimenta a Agenda. Automáticos por gatilho, anotações à mão.';

create index events_owner_occurred_idx on public.events (owner_id, occurred_at desc);
create index events_project_occurred_idx on public.events (project_id, occurred_at desc);
create index events_lesson_idx on public.events (lesson_id) where lesson_id is not null;

alter table public.events enable row level security;

create policy "events: cada pessoa lê os próprios"
  on public.events for select to authenticated
  using (owner_id = (select auth.uid()));

/*
 * Pelo app só entra anotação feita à mão (data no passado vale). Evento automático só entra
 * de dentro de um gatilho (pg_trigger_depth() > 0): quem chama a API direto não consegue
 * forjar "criado" nem "concluído". Quem aponta para um projeto precisa ser dono dele.
 */
create policy "events: cada pessoa registra os próprios"
  on public.events for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (source = 'manual' or pg_trigger_depth() > 0)
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner_id = (select auth.uid())
      )
    )
  );

-- Só as anotações à mão se apagam; o histórico automático não se reescreve.
create policy "events: cada pessoa apaga as próprias anotações"
  on public.events for delete to authenticated
  using (owner_id = (select auth.uid()) and source = 'manual');

-- Sem update: nenhum evento muda depois de gravado.
revoke all on public.events from anon, authenticated;
grant select, insert, delete on public.events to authenticated;

/* Projeto criado. */
create function private.log_project_created()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.events (owner_id, type, occurred_at, project_id, project_kind, title, source)
  values (new.owner_id, 'created', now(), new.id, new.kind, new.title, 'auto');
  return new;
end;
$$;

create trigger projects_log_created
  after insert on public.projects
  for each row execute function private.log_project_created();

/*
 * Projeto concluído (status mudou para "done") e projeto editado (nova revisão ou novo título).
 * "Editado" aparece no máximo uma vez por hora por projeto, e não logo depois de "criado": o
 * salvamento automático grava a cada poucos segundos e a Agenda não pode virar ruído.
 */
create function private.log_project_changed()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    insert into public.events (owner_id, type, occurred_at, project_id, project_kind, title, source)
    values (new.owner_id, 'completed', now(), new.id, new.kind, new.title, 'auto');
  end if;

  if (new.revision is distinct from old.revision or new.title is distinct from old.title)
     and not exists (
       select 1 from public.events e
       where e.project_id = new.id
         and e.type in ('created', 'edited')
         and e.occurred_at > now() - interval '1 hour'
     ) then
    insert into public.events (owner_id, type, occurred_at, project_id, project_kind, title, source)
    values (new.owner_id, 'edited', now(), new.id, new.kind, new.title, 'auto');
  end if;
  return new;
end;
$$;

create trigger projects_log_changed
  after update on public.projects
  for each row execute function private.log_project_changed();

/*
 * Aula estudada ou revisada: quando studied_at (ou reviewed_at) passa a ter um valor novo. O
 * evento acontece na hora que a pessoa marcou, mesmo que seja do passado. A segunda linha do
 * evento é o nome do caderno.
 */
create function private.log_lesson_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  notebook_title text;
begin
  select p.title into notebook_title from public.projects p where p.id = new.notebook_id;

  if new.studied_at is not null
     and (tg_op = 'INSERT' or new.studied_at is distinct from old.studied_at) then
    insert into public.events
      (owner_id, type, occurred_at, project_id, project_kind, lesson_id, title, detail, source)
    values
      (new.owner_id, 'studied', new.studied_at, new.notebook_id, 'notebook', new.id, new.title,
       notebook_title, 'auto');
  end if;

  if new.reviewed_at is not null
     and (tg_op = 'INSERT' or new.reviewed_at is distinct from old.reviewed_at) then
    insert into public.events
      (owner_id, type, occurred_at, project_id, project_kind, lesson_id, title, detail, source)
    values
      (new.owner_id, 'reviewed', new.reviewed_at, new.notebook_id, 'notebook', new.id, new.title,
       notebook_title, 'auto');
  end if;
  return new;
end;
$$;

create trigger lessons_log_progress
  after insert or update on public.lessons
  for each row execute function private.log_lesson_progress();

-- Funções de gatilho ficam fora do esquema exposto pela API e ninguém as chama à mão.
revoke all on function private.log_project_created() from public, anon, authenticated;
revoke all on function private.log_project_changed() from public, anon, authenticated;
revoke all on function private.log_lesson_progress() from public, anon, authenticated;
