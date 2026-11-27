-- Imagens do quadro (etapa 1.3): bucket privado "arquivos", com uma pasta por pessoa.
-- O caminho de cada arquivo começa pelo id da pessoa: <auth.uid()>/<uuid>.<ext>.
-- Ninguém lê nem grava fora da própria pasta; para mostrar, o app pede uma URL assinada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'arquivos',
  'arquivos',
  false,
  10485760, -- 10 MB, o mesmo limite do quadro
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "arquivos: cada pessoa lê a própria pasta"
  on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "arquivos: cada pessoa envia para a própria pasta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "arquivos: cada pessoa troca na própria pasta"
  on storage.objects for update to authenticated
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'arquivos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "arquivos: cada pessoa apaga na própria pasta"
  on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
