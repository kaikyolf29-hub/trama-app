-- Resumo semanal e lembrete de revisão por e-mail (etapa 2.6, docs/PLAN.md, "E-mails").
--
-- A tarefa agendada (Cron Trigger) do Worker da API não tem o token de nenhuma pessoa. Ela lê o
-- banco com a chave secreta do Supabase (`service_role`), e SÓ por estas funções: cada uma
-- devolve o mínimo (quem escolher, o que entra no e-mail) e nenhuma é liberada para `anon` nem
-- `authenticated`. Ficam em `public` porque o PostgREST só chama funções de esquemas expostos
-- (o `private` não é); a trava é o `revoke` / `grant` no fim.

/*
 * Registro dos e-mails já enviados, uma linha por pessoa, tipo e dia local. Serve a três coisas:
 * não mandar duas vezes o mesmo e-mail (a tarefa roda de hora em hora e tenta de novo até
 * as 10h), contar o limite de 100 envios por dia do plano grátis do Resend, e nada mais: não
 * guarda e-mail, nome nem texto.
 */
create table public.email_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('weekly_summary', 'review_reminder')),
  local_date date not null, -- o dia no fuso da pessoa
  created_at timestamptz not null default now(),
  unique (owner_id, kind, local_date)
);

comment on table public.email_log is 'E-mails de resumo e lembrete já enviados (sem texto). Só o Worker, com a chave secreta.';

create index email_log_created_idx on public.email_log (created_at);

-- RLS ligada e nenhuma política: ninguém lê nem grava pelo app; só as funções abaixo.
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

/*
 * Quem deve receber o e-mail agora: preferência ligada (resumo: padrão ligado; lembrete: padrão
 * desligado), e-mail confirmado, entre 8h e 10h59 no fuso da pessoa (o Worker roda de hora em
 * hora, então quem falhou às 8h ainda tenta às 9h e às 10h) e, no resumo, só às segundas.
 * Quem já recebeu naquele dia não volta. Fuso que o Postgres não conhece fica de fora.
 */
create function public.email_candidates(
  p_kind text,
  p_now timestamptz default now(),
  p_limit integer default 50
)
returns table (user_id uuid, email text, name text, timezone text, local_date date)
language sql
stable
security definer
set search_path = ''
as $$
  with valid as materialized (
    select p.id, p.name, p.timezone, p.email_preferences, u.email::text as email
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email is not null
      and u.email_confirmed_at is not null
      and p.timezone in (select z.name from pg_catalog.pg_timezone_names z)
  ),
  local_time as (
    select v.*, (p_now at time zone v.timezone) as local_now from valid v
  )
  select t.id, t.email, t.name, t.timezone, t.local_now::date
  from local_time t
  where p_kind in ('weekly_summary', 'review_reminder')
    and case p_kind
          when 'weekly_summary'
            then coalesce((t.email_preferences ->> 'weeklySummary')::boolean, true)
          else coalesce((t.email_preferences ->> 'reviewReminders')::boolean, false)
        end
    and extract(hour from t.local_now) between 8 and 10
    and (p_kind <> 'weekly_summary' or extract(isodow from t.local_now) = 1)
    and not exists (
      select 1 from public.email_log l
      where l.owner_id = t.id and l.kind = p_kind and l.local_date = t.local_now::date
    )
  order by t.id
  limit least(greatest(p_limit, 1), 200);
$$;

/*
 * Reserva o envio antes de mandar: 'claimed' (pode mandar), 'duplicate' (já foi) ou 'limit'
 * (o dia, em UTC, já chegou ao máximo de envios do plano). O cadeado evita duas execuções da
 * tarefa passarem do limite juntas.
 */
create function public.claim_email(
  p_user uuid,
  p_kind text,
  p_local_date date,
  p_daily_limit integer default 100
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  perform pg_advisory_xact_lock(hashtext('trama:email_log'));

  if (
    select count(*) from public.email_log l
    where l.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
  ) >= p_daily_limit then
    return 'limit';
  end if;

  insert into public.email_log (owner_id, kind, local_date)
  values (p_user, p_kind, p_local_date)
  on conflict (owner_id, kind, local_date) do nothing;
  get diagnostics inserted = row_count;

  return case when inserted = 1 then 'claimed' else 'duplicate' end;
end;
$$;

/* Desfaz a reserva quando o Resend recusou o envio (vale de novo na próxima hora da janela). */
create function public.release_email(p_user uuid, p_kind text, p_local_date date)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.email_log l
  where l.owner_id = p_user and l.kind = p_kind and l.local_date = p_local_date;
$$;

/*
 * Os dados do e-mail de uma pessoa, numa chamada só (o plano grátis do Worker limita as
 * chamadas por execução): os eventos "estudada", "revisada" e "concluído" entre p_from
 * (incluído) e p_to (excluído), e as aulas para revisar (status "Revisar", ou "Feito" com a
 * data de revisão até p_review_until), com o nome do caderno.
 */
create function public.digest_data(
  p_user uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_review_until date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(e order by e.occurred_at)
      from (
        select ev.type, ev.occurred_at, ev.project_kind, ev.title, ev.detail
        from public.events ev
        where ev.owner_id = p_user
          and ev.occurred_at >= p_from and ev.occurred_at < p_to
          and ev.type in ('studied', 'reviewed', 'completed')
        order by ev.occurred_at
        limit 500
      ) e
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(l order by l.review_on nulls last, l.title)
      from (
        select ls.title, n.title as notebook_title, ls.status, ls.review_on
        from public.lessons ls
        join public.projects n on n.id = ls.notebook_id
        where ls.owner_id = p_user
          and (ls.status = 'review' or (ls.status = 'done' and ls.review_on <= p_review_until))
        order by ls.review_on nulls last, ls.title
        limit 200
      ) l
    ), '[]'::jsonb)
  );
$$;

/* O link de descadastro desliga só aquela preferência. Devolve se a pessoa existe. */
create function public.set_email_preference(p_user uuid, p_key text, p_value boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key not in ('weeklySummary', 'reviewReminders') then
    raise exception 'preferência desconhecida' using errcode = '22023';
  end if;
  update public.profiles
  set email_preferences = email_preferences || jsonb_build_object(p_key, p_value)
  where id = p_user;
  return found;
end;
$$;

-- A trava: só a chave secreta (service_role) chama. Nem o `public` do Postgres, nem anon, nem
-- authenticated (o Supabase libera novas funções para eles por padrão).
revoke all on function public.email_candidates(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_email(uuid, text, date, integer) from public, anon, authenticated;
revoke all on function public.release_email(uuid, text, date) from public, anon, authenticated;
revoke all on function public.digest_data(uuid, timestamptz, timestamptz, date) from public, anon, authenticated;
revoke all on function public.set_email_preference(uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.email_candidates(text, timestamptz, integer) to service_role;
grant execute on function public.claim_email(uuid, text, date, integer) to service_role;
grant execute on function public.release_email(uuid, text, date) to service_role;
grant execute on function public.digest_data(uuid, timestamptz, timestamptz, date) to service_role;
grant execute on function public.set_email_preference(uuid, text, boolean) to service_role;
