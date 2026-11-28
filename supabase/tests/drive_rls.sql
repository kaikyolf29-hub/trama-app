-- Testa drive_connections, drive_record_copy e as funções do e-mail de boas-vindas, com as
-- regras de acesso (RLS). Roda numa transação desfeita no fim. Sem erro = passou.
begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'teste-a@trama.invalid', '{"name": "Ana"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'teste-b@trama.invalid', '{"name": "Bia"}', now(), now());

-- Quem se cadastra depois da migration ainda não recebeu as boas-vindas.
do $$
begin
  if (select welcome_email_sent_at from public.profiles where id = '11111111-1111-4111-8111-111111111111') is not null then
    raise exception 'uma conta nova ainda não recebeu as boas-vindas';
  end if;
end $$;

-- Como Ana, logada.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

do $$
declare
  result record;
begin
  insert into public.drive_connections (google_email, refresh_token_encrypted)
  values ('ana@exemplo.com', 'dikBMhEFUTx0lZ0gl0N0VAZ5uN9R4xW1Yl1kLw0xJk8=');
  if (select owner_id from public.drive_connections) <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'o dono da conexão deveria ser quem criou';
  end if;

  -- Nome em branco ou texto curto demais para ser um token cifrado: recusado.
  begin
    insert into public.drive_connections (owner_id, refresh_token_encrypted)
    values ('22222222-2222-4222-8222-222222222222', 'curto');
    raise exception 'deveria recusar token curto e conexão em nome de outra pessoa';
  exception when check_violation or insufficient_privilege then null;
  end;

  -- Falhas seguidas somam; o sucesso zera.
  select * into result from public.drive_record_copy(false, 'Google recusou');
  select * into result from public.drive_record_copy(false, 'Google recusou');
  select * into result from public.drive_record_copy(false, 'Google recusou');
  if result.consecutive_failures <> 3 then
    raise exception 'três falhas deveriam somar 3, deu %', result.consecutive_failures;
  end if;
  if (select last_error from public.drive_connections) <> 'Google recusou' then
    raise exception 'o último erro deveria ficar guardado';
  end if;
  select * into result from public.drive_record_copy(true);
  if result.consecutive_failures <> 0 or result.last_copy_at is null then
    raise exception 'o sucesso deveria zerar as falhas e anotar a hora';
  end if;
  if (select last_error from public.drive_connections) is not null then
    raise exception 'o sucesso deveria limpar o último erro';
  end if;

  -- Boas-vindas: a primeira reserva vale, a segunda não; devolver reabre (reserva recente).
  if not public.claim_welcome_email() then
    raise exception 'a primeira reserva deveria valer';
  end if;
  if public.claim_welcome_email() then
    raise exception 'a segunda reserva não deveria valer';
  end if;
  perform public.release_welcome_email();
  if not public.claim_welcome_email() then
    raise exception 'depois de devolver, a reserva deveria valer de novo';
  end if;
end $$;

-- Como Bia: não vê nem mexe na conexão da Ana.
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

do $$
declare
  changed int;
  result record;
begin
  if (select count(*) from public.drive_connections) <> 0 then
    raise exception 'Bia não deveria ver a conexão de Ana';
  end if;
  update public.drive_connections set google_email = 'invadido@exemplo.com';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Bia não deveria mudar a conexão de Ana'; end if;
  delete from public.drive_connections;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Bia não deveria apagar a conexão de Ana'; end if;
  -- Sem conexão própria, anotar a cópia não muda nada.
  select * into result from public.drive_record_copy(false, 'x');
  if result.consecutive_failures is not null then
    raise exception 'sem conexão própria, a contagem não deveria mudar nada';
  end if;
  -- A reserva da Ana não vale para a Bia, e a Bia não reabre a boas-vindas antiga de ninguém.
  perform public.release_welcome_email();
  if not public.claim_welcome_email() then
    raise exception 'Bia ainda não recebeu: a reserva dela deveria valer';
  end if;
end $$;

-- A pessoa não edita a coluna das boas-vindas diretamente.
do $$
begin
  begin
    update public.profiles set welcome_email_sent_at = null where id = '22222222-2222-4222-8222-222222222222';
    raise exception 'deveria recusar editar welcome_email_sent_at';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Sem login, nada.
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.drive_connections;
    raise exception 'anon não deveria ler drive_connections';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_welcome_email();
    raise exception 'anon não deveria reservar boas-vindas';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
