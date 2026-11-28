-- E-mail de boas-vindas (etapa 0.4, enviado pela API na 1.6): sai uma vez por pessoa.
-- Quem já tinha conta antes desta migration conta como "já recebeu".

alter table public.profiles add column welcome_email_sent_at timestamptz;
-- Quantas vezes a reserva já foi feita: no máximo 3 (a primeira e duas novas tentativas depois
-- de falhas). Devolver a reserva não zera a conta, então ninguém manda boas-vindas em laço.
alter table public.profiles add column welcome_email_attempts smallint not null default 0;

update public.profiles set welcome_email_sent_at = created_at;

/*
 * Reserva o envio: devolve true para a primeira chamada de cada pessoa e false depois (ou
 * depois de 3 reservas, mesmo devolvidas).
 * `security definer` porque a pessoa não pode editar esta coluna sozinha; só mexe na
 * própria linha (auth.uid()).
 */
create function public.claim_welcome_email()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed integer;
begin
  update public.profiles p
  set welcome_email_sent_at = now(),
      welcome_email_attempts = p.welcome_email_attempts + 1
  where p.id = (select auth.uid())
    and p.welcome_email_sent_at is null
    and p.welcome_email_attempts < 3;
  get diagnostics claimed = row_count;
  return claimed > 0;
end;
$$;

/*
 * Devolve a reserva quando o envio falha, para a próxima tentativa poder mandar. Só vale para
 * uma reserva de menos de 1 minuto: ninguém reabre o envio de uma boas-vindas antiga.
 */
create function public.release_welcome_email()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p
  set welcome_email_sent_at = null
  where p.id = (select auth.uid())
    and p.welcome_email_sent_at > now() - interval '1 minute';
$$;

revoke execute on function public.claim_welcome_email() from public, anon;
revoke execute on function public.release_welcome_email() from public, anon;
grant execute on function public.claim_welcome_email() to authenticated;
grant execute on function public.release_welcome_email() to authenticated;
