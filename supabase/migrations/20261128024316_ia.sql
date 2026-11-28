-- IA (etapa 3.1): as chaves de API que cada pessoa guarda (uma por provedor) e a escolha de
-- provedor, modelo e esforço em Configurações → IA. Cada pessoa usa a própria chave e paga o
-- próprio uso ao provedor.
--
-- A chave fica CRIPTOGRAFADA (AES-GCM, chave TOKEN_ENCRYPTION_KEY, que só o Worker da API
-- tem, com o id da pessoa e o provedor como dado associado): quem lê a tabela pelo banco só
-- vê texto cifrado. A API nunca devolve a chave ao navegador, só os 4 últimos caracteres.

create table public.ai_keys (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'google', 'openai')),
  key_encrypted text not null check (char_length(key_encrypted) between 20 and 4000),
  last4 text not null check (char_length(last4) = 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, provider)
);

comment on table public.ai_keys is
  'Chave de API de cada pessoa em cada provedor de IA (Claude, Gemini, ChatGPT). A chave é criptografada pela API.';
comment on column public.ai_keys.last4 is
  'Os 4 últimos caracteres da chave: é o que a tela mostra ("termina em 1234").';

alter table public.ai_keys enable row level security;

create policy "ai_keys: cada pessoa lê as próprias"
  on public.ai_keys for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "ai_keys: cada pessoa guarda as próprias"
  on public.ai_keys for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "ai_keys: cada pessoa troca as próprias"
  on public.ai_keys for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "ai_keys: cada pessoa apaga as próprias"
  on public.ai_keys for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Grants mínimos: ninguém sem login mexe na tabela, e quem tem login só grava a chave cifrada e
-- os 4 últimos caracteres (o dono vem de auth.uid() e não se escolhe nem se muda). O provedor
-- entra no grant de update porque o "guardar ou trocar" da API é um upsert, que o reescreve.
revoke all on public.ai_keys from anon, authenticated;
grant select on public.ai_keys to authenticated;
grant insert (provider, key_encrypted, last4) on public.ai_keys to authenticated;
grant update (provider, key_encrypted, last4) on public.ai_keys to authenticated;
grant delete on public.ai_keys to authenticated;

create trigger ai_keys_set_updated_at
  before update on public.ai_keys
  for each row execute function private.set_updated_at();

-- Provedor, modelo e esforço: uma linha por pessoa.
create table public.ai_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'google', 'openai')),
  model text not null check (
    char_length(model) between 1 and 128 and model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
  ),
  effort text not null default 'balanced' check (effort in ('fast', 'balanced', 'thorough')),
  updated_at timestamptz not null default now()
);

comment on table public.ai_settings is
  'O provedor, o modelo e o esforço (Rápido, Equilibrado, Caprichado) que cada pessoa escolheu em Configurações → IA.';

alter table public.ai_settings enable row level security;

create policy "ai_settings: cada pessoa lê a própria"
  on public.ai_settings for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "ai_settings: cada pessoa cria a própria"
  on public.ai_settings for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "ai_settings: cada pessoa muda a própria"
  on public.ai_settings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "ai_settings: cada pessoa apaga a própria"
  on public.ai_settings for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_settings to authenticated;
grant insert (provider, model, effort) on public.ai_settings to authenticated;
grant update (provider, model, effort) on public.ai_settings to authenticated;
grant delete on public.ai_settings to authenticated;

create trigger ai_settings_set_updated_at
  before update on public.ai_settings
  for each row execute function private.set_updated_at();
