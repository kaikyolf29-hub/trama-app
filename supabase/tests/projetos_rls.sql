-- Testa projects, project_versions, save_project e restore_project_version, com as regras
-- de acesso (RLS). Roda numa transação desfeita no fim. Sem erro = passou.
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
declare
  project uuid;
  saved record;
  first_version bigint;
begin
  insert into public.projects (id, kind, title, content)
  values ('33333333-3333-4333-8333-333333333333', 'flow', 'Vídeo', '{"schemaVersion": 1}')
  returning id into project;

  if (select owner_id from public.projects where id = project) <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'o dono do projeto deveria ser quem criou';
  end if;

  -- Primeira gravação: revisão 2, sem conflito, e uma foto do estado anterior.
  select * into saved from public.save_project(project, '{"schemaVersion": 1, "a": 1}', 1, '  Vídeo novo  ');
  if saved.revision <> 2 or saved.overwrote then
    raise exception 'a primeira gravação deveria ir para a revisão 2 sem conflito';
  end if;
  if (select title from public.projects where id = project) <> 'Vídeo novo' then
    raise exception 'o título deveria ficar sem os espaços das pontas';
  end if;
  if (select count(*) from public.project_versions where project_id = project and reason = 'autosave') <> 1 then
    raise exception 'a primeira gravação deveria guardar uma foto autosave';
  end if;

  -- Segunda gravação logo depois: sem foto nova (só de 10 em 10 minutos).
  select * into saved from public.save_project(project, '{"schemaVersion": 1, "a": 2}', 2);
  if saved.revision <> 3 or (select count(*) from public.project_versions where project_id = project) <> 1 then
    raise exception 'gravar de novo em menos de 10 minutos não deveria guardar outra foto';
  end if;

  -- Gravação baseada numa revisão velha: vale a nova, e a substituída vai para o histórico.
  select * into saved from public.save_project(project, '{"schemaVersion": 1, "a": 3}', 2);
  if not saved.overwrote or saved.revision <> 4 then
    raise exception 'a gravação velha deveria vencer e avisar que substituiu outra';
  end if;
  if (select content->>'a' from public.project_versions where project_id = project and reason = 'conflict') <> '2' then
    raise exception 'a gravação substituída deveria ficar no histórico';
  end if;

  -- Restaurar a primeira foto: o estado de agora fica guardado como restore.
  select id into first_version from public.project_versions
    where project_id = project and reason = 'autosave';
  perform public.restore_project_version(project, first_version);
  if (select content->>'a' from public.projects where id = project) is not null
     or (select revision from public.projects where id = project) <> 5 then
    raise exception 'restaurar deveria voltar ao conteúdo antigo e subir a revisão';
  end if;
  if (select count(*) from public.project_versions where project_id = project and reason = 'restore') <> 1 then
    raise exception 'restaurar deveria guardar o estado de antes';
  end if;

  begin
    insert into public.projects (kind, title, content) values ('flow', '  espaço  ', '{}');
    raise exception 'título com espaço nas pontas não deveria entrar';
  exception when check_violation then
    null; -- esperado
  end;

  begin
    insert into public.projects (owner_id, kind, title, content)
    values ('22222222-2222-4222-8222-222222222222', 'flow', 'Falso', '{}');
    raise exception 'Ana não pode criar projeto em nome de Bia';
  exception when insufficient_privilege then
    null; -- esperado: a RLS recusa
  end;
end $$;

-- Como Bia, logada: não vê nem mexe no projeto de Ana.
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

do $$
declare
  changed int;
begin
  if (select count(*) from public.projects) <> 0 or (select count(*) from public.project_versions) <> 0 then
    raise exception 'Bia não pode ver projetos nem versões de Ana';
  end if;

  update public.projects set title = 'Invadido' where id = '33333333-3333-4333-8333-333333333333';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'Bia não pode mudar o projeto de Ana';
  end if;

  begin
    perform public.save_project('33333333-3333-4333-8333-333333333333', '{}', 5);
    raise exception 'Bia não pode salvar no projeto de Ana';
  exception when no_data_found then
    null; -- esperado: para Bia o projeto não existe
  end;

  begin
    insert into public.project_versions (project_id, revision, content, reason)
    values ('33333333-3333-4333-8333-333333333333', 1, '{}', 'autosave');
    raise exception 'Bia não pode guardar versão no projeto de Ana';
  exception when insufficient_privilege then
    null; -- esperado
  end;
end $$;

-- Sem login (anon), não se vê nada nem se salva.
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.projects;
    raise exception 'quem não entrou não pode ler projetos';
  exception when insufficient_privilege then
    null; -- esperado: anon não tem acesso à tabela
  end;
  begin
    perform public.save_project('33333333-3333-4333-8333-333333333333', '{}', 1);
    raise exception 'quem não entrou não pode salvar';
  exception when insufficient_privilege then
    null; -- esperado
  end;
end $$;

reset role;
rollback;
