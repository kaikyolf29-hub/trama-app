-- Testa ai_keys e ai_settings com as regras de acesso (RLS) e os grants mínimos. Roda numa
-- transação desfeita no fim. Sem erro = passou.
begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'teste-a@trama.invalid', '{"name": "Ana"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'teste-b@trama.invalid', '{"name": "Bia"}', now(), now());

-- Como Ana, logada.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

do $$
begin
  -- Guardar uma chave: o dono vem de quem fez o pedido.
  insert into public.ai_keys (provider, key_encrypted, last4)
  values ('anthropic', 'v1.dikBMhEFUTx0lZ0g.l0N0VAZ5uN9R4xW1Yl1kLw0xJk8', '1234');
  if (select owner_id from public.ai_keys where provider = 'anthropic')
       <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'o dono da chave deveria ser quem a guardou';
  end if;

  -- Uma chave por provedor por pessoa.
  begin
    insert into public.ai_keys (provider, key_encrypted, last4)
    values ('anthropic', 'v1.outraChaveOutraChave.outraChaveOutraChave', '9999');
    raise exception 'deveria recusar a segunda chave do mesmo provedor';
  exception when unique_violation then null;
  end;

  -- Os outros provedores entram.
  insert into public.ai_keys (provider, key_encrypted, last4)
  values ('google', 'v1.chaveDoGoogleChaveDoGoogle.chaveDoGoogle', 'abcd'),
         ('openai', 'v1.chaveDaOpenaiChaveDaOpenai.chaveDaOpenai', 'wxyz');

  -- Provedor desconhecido, chave curta demais e últimos 4 com o tamanho errado: recusados.
  begin
    insert into public.ai_keys (provider, key_encrypted, last4)
    values ('meta', 'v1.chaveDaMetaChaveDaMeta.chaveDaMeta', '1234');
    raise exception 'deveria recusar provedor desconhecido';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_keys (provider, key_encrypted, last4) values ('openai', 'curta', '1234');
    raise exception 'deveria recusar chave cifrada curta demais';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_keys (provider, key_encrypted, last4)
    values ('openai', 'v1.chaveDaOpenaiChaveDaOpenai.chaveDaOpenai', '12345');
    raise exception 'deveria recusar últimos 4 com tamanho errado';
  exception when check_violation then null;
  end;

  -- Trocar a chave muda o texto cifrado e os 4 últimos, e o updated_at anda.
  update public.ai_keys set key_encrypted = 'v1.chaveNovaChaveNovaChaveNova.chaveNova', last4 = '5678'
   where provider = 'anthropic';
  if (select last4 from public.ai_keys where provider = 'anthropic') <> '5678' then
    raise exception 'a troca da chave deveria valer';
  end if;

  -- O dono não muda (fora do grant de update).
  begin
    update public.ai_keys set owner_id = '22222222-2222-4222-8222-222222222222';
    raise exception 'não deveria mudar o dono';
  exception when insufficient_privilege then null;
  end;
  -- Nem escolher o dono ao inserir.
  begin
    insert into public.ai_keys (owner_id, provider, key_encrypted, last4)
    values ('22222222-2222-4222-8222-222222222222', 'anthropic',
            'v1.chaveDaBiaChaveDaBiaChaveDaBia.chaveDaBia', '0000');
    raise exception 'não deveria escolher o dono ao inserir';
  exception when insufficient_privilege then null;
  end;

  -- A API guarda com upsert (insert ... on conflict do update): vale para a chave e para as
  -- preferências, sem pedir privilégio que a pessoa não tem.
  insert into public.ai_keys (provider, key_encrypted, last4)
  values ('google', 'v1.chaveTrocadaChaveTrocada.chaveTrocada', 'efgh')
  on conflict (owner_id, provider) do update
    set provider = excluded.provider, key_encrypted = excluded.key_encrypted, last4 = excluded.last4;
  if (select last4 from public.ai_keys where provider = 'google') <> 'efgh' then
    raise exception 'o upsert da chave deveria trocar a chave';
  end if;
  if (select count(*) from public.ai_keys) <> 3 then
    raise exception 'o upsert não deveria criar uma segunda chave do mesmo provedor';
  end if;

  -- Preferências: uma por pessoa, com padrão "Equilibrado".
  insert into public.ai_settings (provider, model) values ('anthropic', 'claude-haiku-5-5');
  if (select effort from public.ai_settings) <> 'balanced' then
    raise exception 'o esforço padrão deveria ser Equilibrado';
  end if;
  insert into public.ai_settings (provider, model, effort) values ('anthropic', 'claude-opus-5-5', 'fast')
  on conflict (owner_id) do update
    set provider = excluded.provider, model = excluded.model, effort = excluded.effort;
  if (select model from public.ai_settings) <> 'claude-opus-5-5' then
    raise exception 'o upsert das preferências deveria trocar o modelo';
  end if;
  update public.ai_settings set effort = 'thorough', model = 'claude-sonnet-5-5';
  if (select effort from public.ai_settings) <> 'thorough' then
    raise exception 'a mudança de esforço deveria valer';
  end if;
  begin
    insert into public.ai_settings (provider, model) values ('openai', 'gpt-5');
    raise exception 'deveria recusar a segunda linha de preferências';
  exception when unique_violation then null;
  end;
  begin
    update public.ai_settings set effort = 'max';
    raise exception 'deveria recusar esforço desconhecido';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set model = '../x ?y';
    raise exception 'deveria recusar nome de modelo inválido';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set model = '';
    raise exception 'deveria recusar modelo vazio';
  exception when check_violation then null;
  end;
end $$;

-- Como Bia: não vê nem mexe em nada da Ana, e as linhas dela são só dela.
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

do $$
declare
  changed int;
begin
  if (select count(*) from public.ai_keys) <> 0 then
    raise exception 'Bia não deveria ver as chaves de Ana';
  end if;
  if (select count(*) from public.ai_settings) <> 0 then
    raise exception 'Bia não deveria ver as preferências de Ana';
  end if;
  update public.ai_keys set last4 = '0000';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Bia não deveria mudar a chave de Ana'; end if;
  delete from public.ai_keys;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Bia não deveria apagar a chave de Ana'; end if;
  update public.ai_settings set effort = 'fast';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Bia não deveria mudar as preferências de Ana'; end if;
  delete from public.ai_settings;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Bia não deveria apagar as preferências de Ana'; end if;

  -- Bia tem as dela, com os mesmos provedores, sem conflito com as da Ana.
  insert into public.ai_keys (provider, key_encrypted, last4)
  values ('anthropic', 'v1.chaveDaBiaChaveDaBiaChaveDaBia.chaveDaBia', '0000');
  insert into public.ai_settings (provider, model, effort) values ('google', 'gemini-3-pro', 'fast');
  if (select count(*) from public.ai_keys) <> 1 then
    raise exception 'Bia deveria ver só a chave dela';
  end if;
end $$;

-- Sem login, nada.
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.ai_keys;
    raise exception 'anon não deveria ler ai_keys';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.ai_settings;
    raise exception 'anon não deveria ler ai_settings';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_keys (provider, key_encrypted, last4)
    values ('anthropic', 'v1.chaveSemLoginChaveSemLogin.chaveSemLogin', '1111');
    raise exception 'anon não deveria guardar chave';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Apagar a conta apaga as chaves e as preferências (cascata).
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
do $$
begin
  if exists (select 1 from public.ai_keys where owner_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'as chaves deveriam sumir com a conta';
  end if;
  if exists (select 1 from public.ai_settings where owner_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'as preferências deveriam sumir com a conta';
  end if;
end $$;

rollback;
