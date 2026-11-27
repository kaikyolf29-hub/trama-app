-- Testa o bucket "arquivos" e as regras de acesso (RLS) das imagens. Roda dentro de uma
-- transação e desfaz tudo no fim. Para rodar no projeto: cole no SQL Editor do Supabase
-- (ou execute_sql pelo conector). Sem erro = passou.
begin;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'arquivos'
      and public = false
      and file_size_limit = 10485760
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
      and cardinality(allowed_mime_types) = 4
  ) then
    raise exception 'o bucket arquivos deveria ser privado, com 10 MB e só PNG, JPG, WebP e GIF';
  end if;
end $$;

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
  insert into storage.objects (bucket_id, name)
    values ('arquivos', '11111111-1111-4111-8111-111111111111/thumb.png');

  if (select count(*) from storage.objects where bucket_id = 'arquivos') <> 1 then
    raise exception 'Ana deveria ver a imagem que acabou de enviar';
  end if;

  begin
    insert into storage.objects (bucket_id, name)
      values ('arquivos', '22222222-2222-4222-8222-222222222222/invasao.png');
    raise exception 'Ana não pode enviar para a pasta de outra pessoa';
  exception when insufficient_privilege then
    null; -- esperado: a RLS recusa
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('arquivos', 'solta.png');
    raise exception 'arquivo fora de uma pasta de pessoa não pode entrar';
  exception when insufficient_privilege then
    null; -- esperado
  end;
end $$;

-- Como Bia, logada: não vê nem mexe na imagem de Ana.
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

do $$
declare
  changed int;
begin
  if (select count(*) from storage.objects where bucket_id = 'arquivos') <> 0 then
    raise exception 'Bia não pode ver as imagens de Ana';
  end if;

  update storage.objects set name = '22222222-2222-4222-8222-222222222222/roubada.png'
    where bucket_id = 'arquivos' and name like '11111111-1111-4111-8111-111111111111/%';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'Bia não pode mexer nas imagens de Ana';
  end if;
end $$;

-- Sem login (anon), não se vê nada.
reset role;
set local role anon;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'arquivos') <> 0 then
    raise exception 'quem não entrou não pode ver imagens';
  end if;
end $$;

reset role;
rollback;
