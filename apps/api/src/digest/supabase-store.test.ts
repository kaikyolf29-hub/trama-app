import { describe, expect, it } from 'vitest';
import { createSupabaseDigestStore } from './supabase-store';

const URL_BASE = 'https://x.supabase.co';
const SECRET = 'sb_secret_falsa';
const ANA = '11111111-1111-4111-8111-111111111111';

/** O PostgREST de mentira: responde cada função e anota o que foi pedido. */
function fakePostgrest(replies: Record<string, unknown>) {
  const requests: { path: string; body: unknown; headers: Headers }[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    return request.text().then((text) => {
      requests.push({
        path,
        body: text ? (JSON.parse(text) as unknown) : null,
        headers: request.headers,
      });
      const name = path.replace('/rest/v1/rpc/', '');
      const reply = replies[name];
      if (reply === undefined) return new Response('{"message":"não existe"}', { status: 404 });
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  };
  return { fetcher, requests };
}

describe('armazém do resumo e do lembrete (chave secreta)', () => {
  it('só chama as funções liberadas, com a chave secreta, e lê as respostas pelos esquemas', async () => {
    const { fetcher, requests } = fakePostgrest({
      email_candidates: [
        {
          user_id: ANA,
          email: 'ana@exemplo.com',
          name: 'Ana',
          timezone: 'America/Sao_Paulo',
          local_date: '2026-11-30',
        },
      ],
      claim_email: 'claimed',
      release_email: null,
      digest_data: {
        events: [
          {
            type: 'studied',
            occurred_at: '2026-11-25T17:00:00+00:00',
            project_kind: 'notebook',
            title: 'Atalhos',
            detail: 'Premiere Pro',
          },
        ],
        lessons: [
          { title: 'Cor', notebook_title: 'Premiere Pro', status: 'done', review_on: '2026-11-30' },
        ],
      },
      set_email_preference: true,
    });
    const store = createSupabaseDigestStore(URL_BASE, SECRET, fetcher);

    const [candidate] = await store.candidates(
      'weekly_summary',
      new Date('2026-11-30T11:00:00Z'),
      10,
    );
    expect(candidate).toEqual({
      userId: ANA,
      email: 'ana@exemplo.com',
      name: 'Ana',
      timezone: 'America/Sao_Paulo',
      localDate: '2026-11-30',
    });
    expect(await store.claim(ANA, 'weekly_summary', '2026-11-30', 100)).toBe('claimed');
    await store.release(ANA, 'weekly_summary', '2026-11-30');
    const data = await store.data(ANA, {
      from: '2026-11-23T03:00:00.000Z',
      to: '2026-11-30T03:00:00.000Z',
      reviewUntil: '2026-12-06',
    });
    expect(data.events[0]).toMatchObject({
      type: 'studied',
      occurredAt: '2026-11-25T17:00:00.000Z',
    });
    expect(data.lessons[0]).toEqual({
      title: 'Cor',
      notebookTitle: 'Premiere Pro',
      status: 'done',
      reviewOn: '2026-11-30',
    });
    expect(await store.setPreference(ANA, 'weeklySummary', false)).toBe(true);

    // Só funções (nunca uma tabela), todas com a chave secreta.
    expect(requests.map((r) => r.path)).toEqual([
      '/rest/v1/rpc/email_candidates',
      '/rest/v1/rpc/claim_email',
      '/rest/v1/rpc/release_email',
      '/rest/v1/rpc/digest_data',
      '/rest/v1/rpc/set_email_preference',
    ]);
    for (const request of requests) expect(request.headers.get('apikey')).toBe(SECRET);
    expect(requests[0]?.body).toEqual({
      p_kind: 'weekly_summary',
      p_now: '2026-11-30T11:00:00.000Z',
      p_limit: 10,
    });
    expect(requests[4]?.body).toEqual({ p_user: ANA, p_key: 'weeklySummary', p_value: false });
  });

  it('erro do banco vira erro sem dado pessoal; resposta fora do formato é recusada', async () => {
    const down = createSupabaseDigestStore(URL_BASE, SECRET, fakePostgrest({}).fetcher);
    await expect(down.claim(ANA, 'weekly_summary', '2026-11-30', 100)).rejects.toThrow(
      /^Supabase \(claim_email\)/,
    );
    const odd = createSupabaseDigestStore(
      URL_BASE,
      SECRET,
      fakePostgrest({ claim_email: 'talvez', email_candidates: [{ user_id: 'x' }] }).fetcher,
    );
    await expect(odd.claim(ANA, 'weekly_summary', '2026-11-30', 100)).rejects.toThrow();
    await expect(odd.candidates('weekly_summary', new Date(), 5)).rejects.toThrow();
  });
});
