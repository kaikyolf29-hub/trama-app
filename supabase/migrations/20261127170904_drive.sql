-- Conexão com o Google Drive (etapa 1.6): uma linha por pessoa, só dela.
-- O refresh token fica CRIPTOGRAFADO (AES-GCM, chave TOKEN_ENCRYPTION_KEY, que só o Worker da
-- API tem): quem lê a tabela pelo banco só vê o texto cifrado.

create table public.drive_connections (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  google_email text check (google_email is null or char_length(google_email) <= 320),
  refresh_token_encrypted text not null check (char_length(refresh_token_encrypted) between 20 and 4000),
  root_folder_id text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  last_copy_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.drive_connections is
  'Conexão de cada pessoa com o Google Drive (escopo drive.file). O token é criptografado pela API.';

alter table public.drive_connections enable row level security;

create policy "drive_connections: cada pessoa lê a própria"
  on public.drive_connections for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "drive_connections: cada pessoa conecta a própria"
  on public.drive_connections for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "drive_connections: cada pessoa muda a própria"
  on public.drive_connections for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "drive_connections: cada pessoa desconecta a própria"
  on public.drive_connections for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Ninguém sem login mexe na tabela, nem com a RLS (cinto e suspensório).
revoke all on public.drive_connections from anon;

create trigger drive_connections_set_updated_at
  before update on public.drive_connections
  for each row execute function private.set_updated_at();

/*
 * Anota o resultado de uma cópia para o Drive. Sucesso zera a contagem de falhas seguidas;
 * falha soma 1 (o aviso por e-mail sai quando chega a 3). Numa transação só, para duas
 * cópias ao mesmo tempo não se atropelarem.
 */
create function public.drive_record_copy(p_ok boolean, p_error text default null)
returns table (consecutive_failures integer, last_copy_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  update public.drive_connections c
  set consecutive_failures = case when p_ok then 0 else c.consecutive_failures + 1 end,
      last_error = case when p_ok then null else left(p_error, 300) end,
      last_copy_at = case when p_ok then now() else c.last_copy_at end
  where c.owner_id = (select auth.uid())
  returning c.consecutive_failures, c.last_copy_at;
$$;

revoke execute on function public.drive_record_copy(boolean, text) from public, anon;
grant execute on function public.drive_record_copy(boolean, text) to authenticated;
