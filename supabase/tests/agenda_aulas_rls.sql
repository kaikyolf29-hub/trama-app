-- Testa lessons, events, os gatilhos que gravam os eventos automáticos e as regras de acesso
-- (RLS). Roda numa transação desfeita no fim. Sem erro = passou.
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

-- Projeto criado: um evento automático, com o título e o tipo guardados na hora.
do $$
declare
  ev record;
begin
  insert into public.projects (id, kind, title, content)
  values ('33333333-3333-4333-8333-333333333333', 'flow', 'Vídeo', '{"schemaVersion": 1}');

  select * into ev from public.events where project_id = '33333333-3333-4333-8333-333333333333';
  if not found or ev.type <> 'created' or ev.source <> 'auto' or ev.title <> 'Vídeo'
     or ev.project_kind <> 'flow' or ev.owner_id <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'criar um projeto deveria gravar o evento automático "created"';
  end if;

  -- Salvar logo depois de criar não vira "editado" (o salvamento automático é frequente).
  perform public.save_project('33333333-3333-4333-8333-333333333333', '{"schemaVersion": 1, "a": 1}', 1);
  if (select count(*) from public.events where type = 'edited') <> 0 then
    raise exception 'salvar logo depois de criar não deveria gravar "edited"';
  end if;
end $$;

-- Passa 2 horas (quem altera o relógio dos eventos é o dono do banco).
reset role;
update public.events set occurred_at = occurred_at - interval '2 hours';
set local role authenticated;

do $$
begin
  perform public.save_project('33333333-3333-4333-8333-333333333333', '{"schemaVersion": 1, "a": 2}', 2);
  if (select count(*) from public.events where type = 'edited') <> 1 then
    raise exception 'depois de 1 hora, salvar deveria gravar um "edited"';
  end if;

  -- Mais salvamentos na mesma hora: nenhum evento novo.
  perform public.save_project('33333333-3333-4333-8333-333333333333', '{"schemaVersion": 1, "a": 3}', 3);
  perform public.save_project('33333333-3333-4333-8333-333333333333', '{"schemaVersion": 1, "a": 4}', 4);
  if (select count(*) from public.events where type = 'edited') <> 1 then
    raise exception 'no máximo um "edited" por projeto por hora';
  end if;

  -- Mudar o status não é editar; chegar em "done" grava "completed", uma vez só.
  update public.projects set status = 'in_progress' where id = '33333333-3333-4333-8333-333333333333';
  if (select count(*) from public.events where type in ('completed', 'edited')) <> 1 then
    raise exception 'mudar só o status para em andamento não deveria gravar evento';
  end if;
  update public.projects set status = 'done' where id = '33333333-3333-4333-8333-333333333333';
  update public.projects set status = 'done' where id = '33333333-3333-4333-8333-333333333333';
  if (select count(*) from public.events where type = 'completed') <> 1 then
    raise exception 'concluir deveria gravar um "completed" só';
  end if;
end $$;

reset role;
update public.events set occurred_at = occurred_at - interval '2 hours';
set local role authenticated;

-- Renomear conta como editar, com o título novo no evento.
do $$
begin
  update public.projects set title = 'Vídeo renomeado'
  where id = '33333333-3333-4333-8333-333333333333';
  if (select count(*) from public.events where type = 'edited') <> 2
     or not exists (select 1 from public.events where type = 'edited' and title = 'Vídeo renomeado') then
    raise exception 'renomear deveria gravar um "edited" com o título novo';
  end if;
  if not exists (select 1 from public.events where type = 'created' and title = 'Vídeo') then
    raise exception 'o evento "created" guarda o título de quando aconteceu';
  end if;
end $$;

-- Aulas: só em caderno, e estudar ou revisar grava o evento na hora marcada.
do $$
declare
  lesson uuid;
  ev record;
begin
  insert into public.projects (id, kind, title, content)
  values ('44444444-4444-4444-8444-444444444444', 'notebook', 'Premiere Pro', '{}');

  begin
    insert into public.lessons (notebook_id, title)
    values ('33333333-3333-4333-8333-333333333333', 'Aula num fluxo');
    raise exception 'aula só entra em projeto do tipo caderno';
  exception when insufficient_privilege then
    null; -- esperado: a RLS recusa
  end;

  insert into public.lessons (notebook_id, title)
  values ('44444444-4444-4444-8444-444444444444', 'Atalhos de corte')
  returning id into lesson;
  if (select count(*) from public.events where lesson_id = lesson) <> 0 then
    raise exception 'criar a aula sem estudar não grava evento';
  end if;

  update public.lessons
  set status = 'done', studied_at = '2026-11-12T14:32:00-03:00', review_on = '2026-11-19'
  where id = lesson;
  select * into ev from public.events where lesson_id = lesson and type = 'studied';
  if not found or ev.occurred_at <> '2026-11-12T14:32:00-03:00'::timestamptz
     or ev.title <> 'Atalhos de corte' or ev.detail <> 'Premiere Pro' or ev.source <> 'auto'
     or ev.project_id <> '44444444-4444-4444-8444-444444444444' or ev.project_kind <> 'notebook' then
    raise exception 'estudar deveria gravar "studied" na hora marcada, com o caderno no detalhe';
  end if;

  -- Mexer em outro campo, ou repetir a mesma data, não grava de novo.
  update public.lessons set notes = 'Anotações', studied_at = '2026-11-12T14:32:00-03:00' where id = lesson;
  update public.lessons set studied_at = null where id = lesson;
  if (select count(*) from public.events where lesson_id = lesson) <> 1 then
    raise exception 'só uma data nova grava evento (e limpar a data não grava nada)';
  end if;

  update public.lessons set reviewed_at = '2026-11-19T09:00:00-03:00' where id = lesson;
  if (select count(*) from public.events where lesson_id = lesson and type = 'reviewed'
        and occurred_at = '2026-11-19T09:00:00-03:00'::timestamptz) <> 1 then
    raise exception 'revisar deveria gravar "reviewed"';
  end if;

  -- Criar a aula já estudada também grava.
  insert into public.lessons (notebook_id, title, studied_at, reviewed_at)
  values ('44444444-4444-4444-8444-444444444444', 'Correção de cor', '2026-11-05T20:10:00-03:00', '2026-11-12T20:10:00-03:00');
  if (select count(*) from public.events where type in ('studied', 'reviewed')) <> 4 then
    raise exception 'criar a aula já estudada e revisada deveria gravar dois eventos';
  end if;
end $$;

-- Anotações à mão: do passado vale; evento automático forjado não.
do $$
declare
  note uuid;
begin
  insert into public.events (type, title, detail, occurred_at, source)
  values ('note', 'Gravei o episódio 11', 'Sem corte', '2025-03-04T10:00:00-03:00', 'manual')
  returning id into note;
  if (select owner_id from public.events where id = note) <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'o dono da anotação deveria ser quem criou';
  end if;

  insert into public.events (type, title, project_id, source)
  values ('note', 'Sobre o vídeo', '33333333-3333-4333-8333-333333333333', 'manual');

  begin
    insert into public.events (type, title, source) values ('created', 'Forjado', 'auto');
    raise exception 'ninguém forja evento automático pela API';
  exception when insufficient_privilege then
    null; -- esperado: a RLS recusa
  end;

  begin
    insert into public.events (type, title, source) values ('completed', 'Forjado', 'manual');
    raise exception 'evento manual só pode ser anotação';
  exception when check_violation then
    null; -- esperado
  end;

  begin
    insert into public.events (type, title, source) values ('note', 'Falso', 'auto');
    raise exception 'anotação é sempre manual';
  exception when insufficient_privilege or check_violation then
    null; -- esperado: a RLS (ou a regra da tabela) recusa
  end;

  begin
    insert into public.events (type, title, source) values ('note', '   ', 'manual');
    raise exception 'título vazio não entra';
  exception when check_violation then
    null; -- esperado
  end;

  begin
    insert into public.events (owner_id, type, title, source)
    values ('22222222-2222-4222-8222-222222222222', 'note', 'Em nome de Bia', 'manual');
    raise exception 'Ana não pode anotar em nome de Bia';
  exception when insufficient_privilege then
    null; -- esperado
  end;

  begin
    update public.events set title = 'Mudou' where id = note;
    raise exception 'evento não se edita depois de gravado';
  exception when insufficient_privilege then
    null; -- esperado: sem grant de update
  end;

  -- Só anotações se apagam; as automáticas ficam.
  delete from public.events where type = 'created';
  if (select count(*) from public.events where type = 'created') <> 2 then
    raise exception 'evento automático não deveria ser apagado';
  end if;
  delete from public.events where id = note;
  if exists (select 1 from public.events where id = note) then
    raise exception 'a anotação deveria ser apagada';
  end if;
end $$;

-- Como Bia, logada: não vê nem mexe em nada de Ana.
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

do $$
declare
  changed int;
begin
  if (select count(*) from public.events) <> 0 or (select count(*) from public.lessons) <> 0 then
    raise exception 'Bia não pode ver eventos nem aulas de Ana';
  end if;

  update public.lessons set title = 'Invadida';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'Bia não pode mudar as aulas de Ana';
  end if;

  delete from public.events;
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'Bia não pode apagar os eventos de Ana';
  end if;

  begin
    insert into public.lessons (notebook_id, title)
    values ('44444444-4444-4444-8444-444444444444', 'Aula no caderno de Ana');
    raise exception 'Bia não pode criar aula no caderno de Ana';
  exception when insufficient_privilege then
    null; -- esperado
  end;

  begin
    insert into public.events (type, title, project_id, source)
    values ('note', 'No projeto de Ana', '33333333-3333-4333-8333-333333333333', 'manual');
    raise exception 'Bia não pode ligar uma anotação ao projeto de Ana';
  exception when insufficient_privilege then
    null; -- esperado
  end;
end $$;

-- De volta como Ana: apagar o projeto deixa os eventos (sem a ligação) e leva as aulas.
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

do $$
begin
  delete from public.projects where id = '44444444-4444-4444-8444-444444444444';
  if exists (select 1 from public.lessons) then
    raise exception 'apagar o caderno deveria apagar as aulas';
  end if;
  if (select count(*) from public.events where type in ('studied', 'reviewed') and project_id is null and lesson_id is null) <> 4 then
    raise exception 'os eventos das aulas ficam, sem a ligação com o caderno e a aula';
  end if;
  if not exists (select 1 from public.events where type = 'studied' and title = 'Atalhos de corte' and detail = 'Premiere Pro') then
    raise exception 'os eventos guardam o título de quando aconteceram';
  end if;
end $$;

-- Sem login (anon), não se vê nada.
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.events;
    raise exception 'quem não entrou não pode ler eventos';
  exception when insufficient_privilege then
    null; -- esperado
  end;
  begin
    perform count(*) from public.lessons;
    raise exception 'quem não entrou não pode ler aulas';
  exception when insufficient_privilege then
    null; -- esperado
  end;
end $$;

reset role;
rollback;
