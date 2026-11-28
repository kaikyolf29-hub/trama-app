-- Testa as funções do resumo semanal e do lembrete de revisão (etapa 2.6): quem recebe e quando,
-- a reserva do envio (sem repetir, com limite por dia), os dados do e-mail e, principalmente, que
-- só a chave secreta (service_role) chama. Roda numa transação desfeita no fim. Sem erro = passou.
begin;

insert into auth.users
  (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'ana@trama.invalid', '{"name": "Ana"}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'bia@trama.invalid', '{"name": "Bia"}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'caio@trama.invalid', '{"name": "Caio"}', now(), now(), null),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'dani@trama.invalid', '{"name": "Dani"}', now(), now(), now());

-- Ana: São Paulo (padrão). Bia: UTC. Caio: e-mail não confirmado. Dani: resumo desligado.
update public.profiles set timezone = 'UTC' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles
  set email_preferences = '{"weeklySummary": false, "reviewReminders": false}'
  where id = '44444444-4444-4444-8444-444444444444';

-- Quem não é a chave secreta não chama nenhuma função, nem lê o registro.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

do $$
declare
  calls text[] := array[
    'select * from public.email_candidates(''weekly_summary'')',
    'select public.claim_email(''11111111-1111-4111-8111-111111111111'', ''weekly_summary'', current_date, 100)',
    'select public.release_email(''11111111-1111-4111-8111-111111111111'', ''weekly_summary'', current_date)',
    'select public.digest_data(''22222222-2222-4222-8222-222222222222'', now() - interval ''7 days'', now(), current_date)',
    'select public.set_email_preference(''22222222-2222-4222-8222-222222222222'', ''weeklySummary'', false)',
    'select * from public.email_log'
  ];
  statement text;
begin
  foreach statement in array calls loop
    begin
      execute statement;
      raise exception 'authenticated não deveria conseguir: %', statement;
    exception when insufficient_privilege then
      null; -- esperado
    end;
  end loop;
end $$;

reset role;
set local role anon;

do $$
begin
  begin
    perform * from public.email_candidates('weekly_summary');
    raise exception 'anon não deveria chamar email_candidates';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.set_email_preference('22222222-2222-4222-8222-222222222222', 'weeklySummary', false);
    raise exception 'anon não deveria desligar a preferência de ninguém';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
set local role service_role;

-- Quem recebe o resumo: segunda-feira, 8h no fuso de cada pessoa.
do $$
declare
  ids uuid[];
begin
  -- Segunda, 30 nov 2026, 11:00 UTC = 08:00 em São Paulo.
  select array_agg(user_id order by user_id) into ids
    from public.email_candidates('weekly_summary', '2026-11-30T11:00:00Z');
  if ids is distinct from array['11111111-1111-4111-8111-111111111111'::uuid] then
    raise exception 'às 8h de segunda em São Paulo só Ana deveria receber (veio %)', ids;
  end if;

  -- 08:00 UTC: Bia (UTC) está nas 8h; Ana ainda é 05:00.
  select array_agg(user_id) into ids from public.email_candidates('weekly_summary', '2026-11-30T08:00:00Z');
  if ids is distinct from array['22222222-2222-4222-8222-222222222222'::uuid] then
    raise exception 'às 8h UTC de segunda só Bia deveria receber (veio %)', ids;
  end if;

  -- Os dados mínimos que o e-mail precisa.
  if (select (email, name, timezone, local_date)::text
        from public.email_candidates('weekly_summary', '2026-11-30T08:00:00Z'))
     <> '(bia@trama.invalid,Bia,UTC,2026-11-30)' then
    raise exception 'o candidato devolveu dados diferentes do combinado';
  end if;

  -- A janela vai até 10h59 (10:59 em São Paulo = 13:59 UTC) e fecha às 11h.
  if not exists (select 1 from public.email_candidates('weekly_summary', '2026-11-30T13:59:00Z')
                 where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'às 10h59 ainda vale tentar o envio';
  end if;
  if exists (select 1 from public.email_candidates('weekly_summary', '2026-11-30T14:00:00Z')
             where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'às 11h a janela de envio já fechou';
  end if;

  -- Terça-feira: nada de resumo.
  if exists (select 1 from public.email_candidates('weekly_summary', '2026-12-01T11:00:00Z')) then
    raise exception 'o resumo só sai às segundas';
  end if;

  -- Caio não confirmou o e-mail e Dani desligou o resumo: nunca entram.
  if exists (
    select 1 from public.email_candidates('weekly_summary', '2026-11-30T11:00:00Z', 200)
    where user_id in ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444')
  ) then
    raise exception 'Caio (sem confirmar) e Dani (desligou) não podem receber';
  end if;

  -- O lembrete vem desligado de fábrica e vale todo dia.
  if exists (select 1 from public.email_candidates('review_reminder', '2026-12-01T11:00:00Z')) then
    raise exception 'o lembrete de revisão vem desligado por padrão';
  end if;
  perform public.set_email_preference('11111111-1111-4111-8111-111111111111', 'reviewReminders', true);
  if not exists (select 1 from public.email_candidates('review_reminder', '2026-12-01T11:00:00Z')
                 where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'Ana ligou o lembrete e deveria receber às 8h de terça';
  end if;

  -- Tipo desconhecido não devolve ninguém.
  if exists (select 1 from public.email_candidates('outro', '2026-11-30T11:00:00Z')) then
    raise exception 'tipo desconhecido não deveria ter candidatos';
  end if;
end $$;

-- Um fuso que o Postgres não conhece não derruba a consulta: a pessoa só fica de fora.
reset role;
update public.profiles set timezone = 'Nao/Existe' where id = '22222222-2222-4222-8222-222222222222';
set local role service_role;

do $$
begin
  if exists (select 1 from public.email_candidates('weekly_summary', '2026-11-30T08:00:00Z')) then
    raise exception 'fuso inválido não deveria entrar';
  end if;
  if not exists (select 1 from public.email_candidates('weekly_summary', '2026-11-30T11:00:00Z')) then
    raise exception 'o fuso inválido de Bia não pode atrapalhar Ana';
  end if;
end $$;

-- A reserva: uma por pessoa, tipo e dia; respeita o limite do dia; dá para desfazer.
do $$
declare
  ana constant uuid := '11111111-1111-4111-8111-111111111111';
  bia constant uuid := '22222222-2222-4222-8222-222222222222';
begin
  if public.claim_email(ana, 'weekly_summary', '2026-11-30', 100) <> 'claimed' then
    raise exception 'a primeira reserva deveria dar certo';
  end if;
  if public.claim_email(ana, 'weekly_summary', '2026-11-30', 100) <> 'duplicate' then
    raise exception 'a segunda reserva do mesmo e-mail deveria ser repetida';
  end if;
  if public.claim_email(ana, 'review_reminder', '2026-11-30', 100) <> 'claimed' then
    raise exception 'outro tipo de e-mail no mesmo dia é outra reserva';
  end if;
  if exists (select 1 from public.email_candidates('weekly_summary', '2026-11-30T11:00:00Z')
             where user_id = ana) then
    raise exception 'quem já recebeu não volta a ser candidato';
  end if;

  -- Já são 2 reservas hoje: com limite 2, a próxima é recusada.
  if public.claim_email(bia, 'weekly_summary', '2026-11-30', 2) <> 'limit' then
    raise exception 'o limite diário deveria recusar a reserva';
  end if;

  -- Se o Resend recusou, a reserva se desfaz e a pessoa volta a ser candidata.
  perform public.release_email(ana, 'weekly_summary', '2026-11-30');
  if not exists (select 1 from public.email_candidates('weekly_summary', '2026-11-30T11:00:00Z')
                 where user_id = ana) then
    raise exception 'depois de desfazer, Ana deveria voltar a ser candidata';
  end if;
  if public.claim_email(ana, 'weekly_summary', '2026-11-30', 100) <> 'claimed' then
    raise exception 'depois de desfazer, dá para reservar de novo';
  end if;
end $$;

-- Os dados do e-mail: eventos da semana e aulas para revisar.
reset role;

do $$
begin
  if exists (select 1 from public.email_log where owner_id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'reserva recusada pelo limite não deixa registro';
  end if;
end $$;

insert into public.projects (id, owner_id, kind, title, content, status)
values
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
   'notebook', 'Premiere Pro', '{}', 'draft'),
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
   'flow', 'Como editar 10x mais rápido', '{"schemaVersion": 1}', 'draft');

insert into public.lessons (owner_id, notebook_id, title, status, studied_at, reviewed_at, review_on)
values
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555',
   'Atalhos de corte', 'done', '2026-11-25T15:00:00Z', null, '2026-11-30'),
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555',
   'Correção de cor', 'done', '2026-11-20T15:00:00Z', '2026-11-26T15:00:00Z', '2026-12-03'),
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555',
   'Áudio limpo', 'done', '2026-11-10T15:00:00Z', null, '2026-12-20'),
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555',
   'Exportação', 'review', null, null, null),
  ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555',
   'Ainda não estudei', 'studying', null, null, null);

update public.projects set status = 'done' where id = '66666666-6666-4666-8666-666666666666';

-- O projeto "concluído" aconteceu agora; leva-o para dentro da semana de teste.
update public.events set occurred_at = '2026-11-27T12:00:00Z' where type = 'completed';

set local role service_role;

do $$
declare
  data jsonb;
begin
  -- A semana de 23 a 30 de nov (excluindo a segunda seguinte), revisão até 6 de dez.
  data := public.digest_data(
    '11111111-1111-4111-8111-111111111111',
    '2026-11-23T03:00:00Z', '2026-11-30T03:00:00Z', '2026-12-06');

  if (select array_agg(e ->> 'type' order by e ->> 'occurred_at') from jsonb_array_elements(data -> 'events') e)
     is distinct from array['studied', 'reviewed', 'completed'] then
    raise exception 'eventos da semana errados: %', data -> 'events';
  end if;
  if (data -> 'events' -> 0 ->> 'title') <> 'Atalhos de corte' or (data -> 'events' -> 0 ->> 'detail') <> 'Premiere Pro' then
    raise exception 'o evento da aula deveria trazer o título e o caderno: %', data -> 'events' -> 0;
  end if;
  -- Criado e editado não entram, só o que a pessoa fez de estudo e o que concluiu.
  if exists (select 1 from jsonb_array_elements(data -> 'events') e where e ->> 'type' in ('created', 'edited', 'note')) then
    raise exception 'só estudada, revisada e concluído entram no e-mail';
  end if;

  -- Aulas para revisar: marcadas "Revisar" e "Feito" com revisão até 6 de dez (Áudio limpo, 20 de dez, fica de fora).
  if (select array_agg(l ->> 'title' order by ord) from jsonb_array_elements(data -> 'lessons') with ordinality as t(l, ord))
     is distinct from array['Atalhos de corte', 'Correção de cor', 'Exportação'] then
    raise exception 'aulas para revisar erradas: %', data -> 'lessons';
  end if;
  if (data -> 'lessons' -> 0 ->> 'notebook_title') <> 'Premiere Pro' then
    raise exception 'a aula deveria trazer o nome do caderno';
  end if;

  -- Quem não tem nada recebe listas vazias, não null.
  data := public.digest_data(
    '22222222-2222-4222-8222-222222222222',
    '2026-11-23T03:00:00Z', '2026-11-30T03:00:00Z', '2026-12-06');
  if data <> '{"events": [], "lessons": []}'::jsonb then
    raise exception 'sem dados deveria vir vazio: %', data;
  end if;
end $$;

-- O descadastro desliga só aquela preferência e não mexe na outra.
do $$
begin
  if not public.set_email_preference('11111111-1111-4111-8111-111111111111', 'weeklySummary', false) then
    raise exception 'deveria achar o perfil de Ana';
  end if;
  if public.set_email_preference('99999999-9999-4999-8999-999999999999', 'weeklySummary', false) then
    raise exception 'pessoa que não existe deveria devolver falso';
  end if;
  begin
    perform public.set_email_preference('11111111-1111-4111-8111-111111111111', 'admin', true);
    raise exception 'chave desconhecida deveria ser recusada';
  exception when invalid_parameter_value then
    null;
  end;
end $$;

reset role;

do $$
begin
  if (select email_preferences from public.profiles where id = '11111111-1111-4111-8111-111111111111')
     <> '{"weeklySummary": false, "reviewReminders": true}'::jsonb then
    raise exception 'só o resumo semanal deveria ter desligado';
  end if;
end $$;

rollback;
