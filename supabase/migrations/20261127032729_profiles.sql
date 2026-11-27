-- Perfis: um por pessoa, criado sozinho no cadastro (docs/PLAN.md, "Tabelas principais").
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  timezone text not null default 'America/Sao_Paulo',
  email_preferences jsonb not null default '{"weeklySummary": true, "reviewReminders": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Um perfil por pessoa: nome, fuso horário e preferências de e-mail.';

-- Toda tabela tem RLS: cada pessoa só lê e edita o próprio perfil.
alter table public.profiles enable row level security;

create policy "Cada pessoa lê o próprio perfil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Cada pessoa edita o próprio perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Sem insert nem delete pelo app: o perfil nasce no cadastro e some com a conta.
-- E só estas colunas podem ser editadas.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, timezone, email_preferences) on public.profiles to authenticated;

-- Funções internas ficam fora do esquema exposto pela API.
create schema if not exists private;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(left(btrim(new.raw_user_meta_data ->> 'name'), 80), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
