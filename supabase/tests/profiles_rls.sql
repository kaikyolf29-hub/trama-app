-- Testa a tabela profiles e as regras de acesso (RLS). Roda dentro de uma transação e
-- desfaz tudo no fim: não deixa nenhum dado no banco. Para rodar no projeto:
-- cole no SQL Editor do Supabase (ou execute_sql pelo conector). Sem erro = passou.
begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'teste-a@trama.invalid', '{"name": "  Ana Teste  "}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'teste-b@trama.invalid', '{}', now(), now());

do $$
begin
  -- O cadastro cria o perfil com o nome limpo e o fuso de São Paulo.
  if (select name from public.profiles where id = '11111111-1111-4111-8111-111111111111') <> 'Ana Teste' then
    raise exception 'o perfil de Ana não guardou o nome limpo';
  end if;
  if (select name from public.profiles where id = '22222222-2222-4222-8222-222222222222') <> '' then
    raise exception 'sem nome no cadastro, o nome deveria ficar vazio';
  end if;
  if (select timezone from public.profiles where id = '11111111-1111-4111-8111-111111111111') <> 'America/Sao_Paulo' then
    raise exception 'o fuso padrão deveria ser America/Sao_Paulo';
  end if;
end $$;

-- Agora como Ana, logada.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

do $$
declare
  changed int;
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'Ana deveria ver só o próprio perfil';
  end if;

  update public.profiles set name = 'Invadido' where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'Ana não pode editar o perfil de outra pessoa';
  end if;

  update public.profiles set name = 'Ana Editada' where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Ana deveria conseguir editar o próprio nome';
  end if;

  begin
    update public.profiles set created_at = now() - interval '1 year'
      where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'Ana não pode mudar a data de criação';
  exception when insufficient_privilege then
    null; -- esperado: só nome, fuso e preferências de e-mail podem mudar
  end;

  begin
    insert into public.profiles (id, name) values ('33333333-3333-4333-8333-333333333333', 'Falso');
    raise exception 'ninguém pode criar perfil pelo app';
  exception when insufficient_privilege then
    null; -- esperado
  end;
end $$;

-- Sem login (anon), não se vê nada.
reset role;
set local role anon;
do $$
begin
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'quem não entrou não pode ver perfis';
  end if;
end $$;

reset role;
rollback;
