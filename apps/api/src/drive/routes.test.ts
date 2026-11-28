import {
  createTramaFile,
  driveCopyResponseSchema,
  driveStatusSchema,
  flowContentSchema,
  parseTramaFile,
} from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it, vi } from 'vitest';
import type { Identity } from '../account/identity';
import { defaultDeps } from '../deps';
import type { Env } from '../env';
import { createApp } from '../index';
import { createResendMailer } from '../mail';
import { createMemoryStore } from '../projects/memory-store';
import { createFakeGoogle, REFRESH_TOKEN } from '../test/fake-google';
import { createGoogle } from './google';
import { createMemoryDriveStore, createMemoryWelcomeStore } from './memory-store';
import { FAILURES_BEFORE_EMAIL, jwtSubject } from './routes';
import { createVault } from './vault';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const API = 'https://api.test';
const SITE = 'https://trama.test';

const ANA: Identity = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@exemplo.com',
  name: 'Ana Souza',
};
const BIA: Identity = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'bia@exemplo.com',
  name: 'Bia',
};

/** Um token de login de mentira com o `sub` certo (o Supabase falso conhece quem é quem). */
const tokenOf = (who: Identity) => {
  const payload = btoa(JSON.stringify({ sub: who.id })).replaceAll('=', '');
  return `cabecalho.${payload}.assinatura`;
};
const USERS = new Map([
  [tokenOf(ANA), ANA],
  [tokenOf(BIA), BIA],
]);

const ENV: Env = {
  APP_URL: SITE,
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  TOKEN_ENCRYPTION_KEY: KEY,
  RESEND_API_KEY: 're_chave',
  EMAIL_FROM: 'Trama <ola@trama.test>',
};

function setup(env: Env = ENV) {
  const google = createFakeGoogle();
  const projects = createMemoryStore();
  const clock = { now: new Date('2026-11-27T12:00:00.000Z') };
  const drive = createMemoryDriveStore(() => clock.now);
  const welcome = createMemoryWelcomeStore();
  const app = createApp(undefined, {
    ...defaultDeps(google.fetch),
    projects: () => projects,
    drive: () => drive,
    welcome: () => welcome,
    identity: () => (token) => {
      const user = USERS.get(token);
      return user ? Promise.resolve(user) : Promise.reject(new Error('token falso'));
    },
    google: (e) =>
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? createGoogle(
            { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET },
            google.fetch,
          )
        : null,
    vault: (e) =>
      e.TOKEN_ENCRYPTION_KEY ? createVault(e.TOKEN_ENCRYPTION_KEY) : Promise.resolve(null),
    mailer: (e) => createResendMailer(e, google.fetch),
    now: () => clock.now,
  });
  const call = (
    path: string,
    init: RequestInit & { as?: Identity | null; origin?: string } = {},
  ) => {
    const { as = ANA, origin = SITE, ...rest } = init;
    return app.request(
      `${API}${path}`,
      {
        ...rest,
        headers: {
          ...(as ? { Authorization: `Bearer ${tokenOf(as)}` } : {}),
          Origin: origin,
          ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
          ...rest.headers,
        },
      },
      env,
    );
  };
  const post = (path: string, body?: unknown, who: Identity | null = ANA) =>
    call(path, {
      method: 'POST',
      as: who,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { app, call, post, google, projects, drive, welcome, clock };
}

/** Faz o caminho todo de conectar: começa, o Google volta com o código, o site entrega o bilhete. */
async function connect(s: ReturnType<typeof setup>, who: Identity = ANA) {
  const start = await s.post('/drive/connect', { returnTo: '/' }, who);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get('state') ?? '';
  const back = await s.call(`/drive/callback?code=codigo-bom&state=${encodeURIComponent(state)}`);
  const ticket = new URLSearchParams(
    new URL(back.headers.get('Location') ?? SITE).hash.slice(1),
  ).get('t');
  const done = await s.post('/drive/connection', { ticket }, who);
  return { start, back, done, ticket: ticket ?? '', state };
}

async function newProject(s: ReturnType<typeof setup>, title = 'Como editar 10x mais rápido') {
  return s.projects.create({
    kind: 'flow',
    title,
    content: flowContentSchema.parse(videoFlowExample),
  });
}

describe('conectar ao Drive (OAuth)', () => {
  it('começa com a tela de consentimento do Google: drive.file, offline e state preso à pessoa', async () => {
    const s = setup();
    const response = await s.post('/drive/connect', { returnTo: '/p/abc' });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const params = new URL(url).searchParams;
    expect(new URL(url).origin + new URL(url).pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(params.get('client_id')).toBe('client-id');
    expect(params.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('prompt')).toBe('consent');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('redirect_uri')).toBe(`${API}/drive/callback`);
    expect(params.get('state')).toMatch(/\./);
    // O segredo do cliente nunca vai para o navegador.
    expect(url).not.toContain('client-secret');
  });

  it('exige o token de login, e responde 503 sem as chaves do Google', async () => {
    const s = setup();
    expect((await s.post('/drive/connect', {}, null)).status).toBe(401);
    expect((await s.call('/drive/status', { as: null })).status).toBe(401);
    const bare = setup({ ...ENV, GOOGLE_CLIENT_ID: undefined });
    const response = await bare.post('/drive/connect', {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'O Drive ainda não está ligado neste ambiente.',
    });
  });

  it('troca o código e devolve o navegador ao site com o bilhete (nada é gravado ainda)', async () => {
    const s = setup();
    const { back, state } = await connect(s);
    expect(back.status).toBe(302);
    const location = new URL(back.headers.get('Location') ?? '');
    expect(location.origin).toBe(SITE);
    expect(location.pathname).toBe('/drive/retorno');
    expect(location.searchParams.get('volta')).toBe('/');
    expect(location.hash).toMatch(/^#t=v1\./);
    expect(back.headers.get('Cache-Control')).toBe('no-store');
    expect(state).not.toBe('');
    // O código foi trocado com o segredo do cliente e a mesma redirect_uri.
    const exchange = s.google.driveCalls('POST', /oauth2\.googleapis\.com\/token/);
    expect(exchange.length).toBeGreaterThanOrEqual(1);
  });

  it('o bilhete grava a conexão com o refresh token CRIPTOGRAFADO', async () => {
    const s = setup();
    const { done } = await connect(s);
    expect(done.status).toBe(200);
    const status = driveStatusSchema.parse(await done.json());
    expect(status).toMatchObject({ available: true, connected: true, email: 'ana@gmail.example' });
    const stored = s.drive.connection?.refreshTokenEncrypted ?? '';
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain(REFRESH_TOKEN);
    // Só o cofre com a chave e o dono certos devolve o token.
    const vault = await createVault(KEY);
    expect(await vault.decrypt(stored, `drive-refresh-token:${ANA.id}`)).toBe(REFRESH_TOKEN);
  });

  it('recusa state adulterado, vencido ou sem state', async () => {
    const s = setup();
    const { state } = await connect(s);
    const forged = `${state.slice(0, -3)}AAA`;
    expect((await s.call(`/drive/callback?code=codigo-bom&state=${forged}`)).status).toBe(400);
    expect((await s.call('/drive/callback?code=codigo-bom')).status).toBe(400);
    s.clock.now = new Date('2026-11-27T12:11:00.000Z');
    expect(
      (await s.call(`/drive/callback?code=codigo-bom&state=${encodeURIComponent(state)}`)).status,
    ).toBe(400);
  });

  it('o bilhete de outra pessoa (CSRF) não conecta a conta de quem está logado', async () => {
    const s = setup();
    // Bia começa a conectar e o navegador de Ana termina o fluxo.
    const { ticket } = await connect(s, BIA);
    s.drive.connection = null;
    const response = await s.post('/drive/connection', { ticket }, ANA);
    expect(response.status).toBe(400);
    expect(s.drive.connection).toBeNull();
  });

  it('o bilhete vence em 10 minutos e não vale depois de adulterado', async () => {
    const s = setup();
    const { ticket } = await connect(s);
    s.drive.connection = null;
    expect((await s.post('/drive/connection', { ticket: `${ticket}x` })).status).toBe(400);
    s.clock.now = new Date('2026-11-27T12:11:00.000Z');
    expect((await s.post('/drive/connection', { ticket })).status).toBe(400);
    expect(s.drive.connection).toBeNull();
  });

  it('a pessoa que nega o acesso, o código recusado e a falta de refresh token voltam com erro', async () => {
    const s = setup();
    const { url } = (await (await s.post('/drive/connect', {})).json()) as { url: string };
    const state = encodeURIComponent(new URL(url).searchParams.get('state') ?? '');
    const redirectOf = async (query: string) => {
      const response = await s.call(`/drive/callback?${query}&state=${state}`);
      expect(response.status).toBe(302);
      return new URL(response.headers.get('Location') ?? '');
    };
    expect((await redirectOf('error=access_denied')).searchParams.get('erro')).toBe('negado');
    expect((await redirectOf('error=server_error')).searchParams.get('erro')).toBe('falhou');
    expect((await redirectOf('code=codigo-ruim')).searchParams.get('erro')).toBe('falhou');
    expect((await redirectOf('')).searchParams.get('erro')).toBe('falhou');
    s.google.state.omitRefreshToken = true;
    const noToken = await redirectOf('code=codigo-bom');
    expect(noToken.searchParams.get('erro')).toBe('falhou');
    expect(noToken.hash).toBe('');
  });

  it('só volta para o site de onde veio (ou o APP_URL), e o returnTo é sempre um caminho do site', async () => {
    const s = setup();
    const evil = await s.post('/drive/connect', { returnTo: '//evil.example/x' });
    const { url } = (await evil.json()) as { url: string };
    const state = encodeURIComponent(new URL(url).searchParams.get('state') ?? '');
    const back = await s.call(`/drive/callback?error=access_denied&state=${state}`);
    expect(new URL(back.headers.get('Location') ?? '').searchParams.get('volta')).toBe('/');

    // Origem desconhecida: vale o APP_URL.
    const other = await s.call('/drive/connect', {
      method: 'POST',
      origin: 'https://evil.example',
      body: '{}',
    });
    const otherState = encodeURIComponent(
      new URL(((await other.json()) as { url: string }).url).searchParams.get('state') ?? '',
    );
    const toApp = await s.call(`/drive/callback?error=access_denied&state=${otherState}`);
    expect(new URL(toApp.headers.get('Location') ?? '').origin).toBe(SITE);
  });
});

describe('estado e desconexão', () => {
  it('sem conexão, o estado é "desconectado"; sem chaves, "indisponível"', async () => {
    const s = setup();
    const status = driveStatusSchema.parse(await (await s.call('/drive/status')).json());
    expect(status).toMatchObject({ available: true, connected: false, email: null });
    const bare = setup({ ...ENV, TOKEN_ENCRYPTION_KEY: undefined });
    expect(driveStatusSchema.parse(await (await bare.call('/drive/status')).json())).toMatchObject({
      available: false,
      connected: false,
    });
  });

  it('sem as chaves do Google, o estado nem consulta o banco (a tabela pode não existir ainda)', async () => {
    const bare = setup({ ...ENV, GOOGLE_CLIENT_ID: undefined });
    vi.spyOn(bare.drive, 'get').mockRejectedValue(
      new Error('relation "drive_connections" does not exist'),
    );
    const response = await bare.call('/drive/status');
    expect(response.status).toBe(200);
    expect(driveStatusSchema.parse(await response.json()).available).toBe(false);
  });

  it('desconectar revoga o acesso no Google e apaga a conexão, mas não os arquivos', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    await s.post(`/drive/projects/${project.id}/copy`);
    const filesBefore = s.google.files.size;
    const response: unknown = await (await s.call('/drive/status')).json();
    expect(driveStatusSchema.parse(response).connected).toBe(true);

    expect((await s.call('/drive', { method: 'DELETE' })).status).toBe(204);
    expect(s.google.revoked).toEqual([REFRESH_TOKEN]);
    expect(s.drive.connection).toBeNull();
    expect(s.google.files.size).toBe(filesBefore);
    // Desconectado de novo não dá erro.
    expect((await s.call('/drive', { method: 'DELETE' })).status).toBe(204);
  });
});

describe('copiar um projeto para o Drive', () => {
  it('sem conexão, responde 409 e nada vai para o Google', async () => {
    const s = setup();
    const project = await newProject(s);
    const response = await s.post(`/drive/projects/${project.id}/copy`);
    expect(response.status).toBe(409);
    expect(s.google.files.size).toBe(0);
  });

  it('na primeira vez cria a pasta Trama, a subpasta do projeto e o projeto.trama', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    const response = await s.post(`/drive/projects/${project.id}/copy`);
    expect(response.status).toBe(200);
    const copied = driveCopyResponseSchema.parse(await response.json());

    const folders = s.google.folders();
    expect(folders.map((f) => f.name).sort()).toEqual(['Como editar 10x mais rápido', 'Trama']);
    const root = folders.find((f) => f.name === 'Trama');
    const sub = folders.find((f) => f.name !== 'Trama');
    expect(sub?.parents).toEqual([root?.id]);
    const file = s.google.files.get(copied.driveFileId);
    expect(file).toMatchObject({ name: 'projeto.trama', parents: [sub?.id] });

    // O arquivo é um .trama válido, com o mesmo fluxo.
    const parsed = parseTramaFile(file?.content ?? '');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.project.id).toBe(project.id);
      expect(parsed.file.content.blocks.length).toBe(videoFlowExample.blocks.length);
      expect(parsed.file.savedAt).toBe('2026-11-27T12:00:00.000Z');
    }
    // O id do arquivo fica no projeto, e a conexão lembra a pasta e a hora da cópia.
    expect((await s.projects.get(project.id))?.driveFileId).toBe(copied.driveFileId);
    expect(s.drive.connection?.rootFolderId).toBe(root?.id);
    expect(s.drive.connection?.lastCopyAt).toBe('2026-11-27T12:00:00.000Z');
  });

  it('nas próximas vezes só atualiza o arquivo: nenhuma pasta ou arquivo novo', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    const first = driveCopyResponseSchema.parse(
      await (await s.post(`/drive/projects/${project.id}/copy`)).json(),
    );
    const filesBefore = s.google.files.size;

    await s.projects.save(project.id, {
      content: flowContentSchema.parse({
        ...videoFlowExample,
        blocks: [],
        frames: [],
        arrows: [],
        presentation: [],
      }),
      title: 'Título novo',
      baseRevision: 1,
    });
    s.clock.now = new Date('2026-11-27T12:00:30.000Z');
    const second = driveCopyResponseSchema.parse(
      await (await s.post(`/drive/projects/${project.id}/copy`)).json(),
    );
    expect(second.driveFileId).toBe(first.driveFileId);
    expect(s.google.files.size).toBe(filesBefore);
    const parsed = parseTramaFile(s.google.files.get(first.driveFileId)?.content ?? '');
    expect(parsed.ok && parsed.file.content.blocks.length).toBe(0);
    expect(parsed.ok && parsed.file.project.title).toBe('Título novo');
    expect(parsed.ok && parsed.file.savedAt).toBe('2026-11-27T12:00:30.000Z');
  });

  it('a pasta Trama é criada uma vez só, mesmo com vários projetos', async () => {
    const s = setup();
    await connect(s);
    const a = await newProject(s, 'Projeto A');
    const b = await newProject(s, 'Projeto B');
    await s.post(`/drive/projects/${a.id}/copy`);
    await s.post(`/drive/projects/${b.id}/copy`);
    expect(s.google.folders().filter((f) => f.name === 'Trama')).toHaveLength(1);
    expect(s.google.folders()).toHaveLength(3);
  });

  it('reconectar reaproveita a pasta Trama que o app já criou no Drive', async () => {
    const s = setup();
    await connect(s);
    await s.post(`/drive/projects/${(await newProject(s)).id}/copy`);
    await s.call('/drive', { method: 'DELETE' });
    await connect(s);
    await s.post(`/drive/projects/${(await newProject(s, 'Outro')).id}/copy`);
    expect(s.google.folders().filter((f) => f.name === 'Trama')).toHaveLength(1);
  });

  it('se a pessoa apagou o arquivo no Drive, a cópia cria um novo', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    const first = driveCopyResponseSchema.parse(
      await (await s.post(`/drive/projects/${project.id}/copy`)).json(),
    );
    s.google.files.delete(first.driveFileId);
    const again = driveCopyResponseSchema.parse(
      await (await s.post(`/drive/projects/${project.id}/copy`)).json(),
    );
    expect(again.driveFileId).not.toBe(first.driveFileId);
    expect((await s.projects.get(project.id))?.driveFileId).toBe(again.driveFileId);
  });

  it('se o arquivo foi para a lixeira, não escreve nele: cria um novo', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    const first = driveCopyResponseSchema.parse(
      await (await s.post(`/drive/projects/${project.id}/copy`)).json(),
    );
    const trashed = s.google.files.get(first.driveFileId);
    if (trashed) trashed.trashed = true;
    const again = driveCopyResponseSchema.parse(
      await (await s.post(`/drive/projects/${project.id}/copy`)).json(),
    );
    expect(again.driveFileId).not.toBe(first.driveFileId);
  });

  it('só copia projetos da própria pessoa', async () => {
    const s = setup();
    await connect(s);
    expect((await s.post(`/drive/projects/${crypto.randomUUID()}/copy`)).status).toBe(404);
    expect((await s.post('/drive/projects/nao-e-id/copy')).status).toBe(404);
  });
});

describe('falhas na cópia e o Aviso do Drive', () => {
  it('conta as falhas seguidas e manda o e-mail só na terceira', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    s.google.state.driveDown = true;

    for (let attempt = 1; attempt <= FAILURES_BEFORE_EMAIL; attempt++) {
      const response = await s.post(`/drive/projects/${project.id}/copy`);
      expect(response.status).toBe(502);
      expect(s.drive.connection?.consecutiveFailures).toBe(attempt);
      expect(s.google.emails).toHaveLength(attempt === FAILURES_BEFORE_EMAIL ? 1 : 0);
    }
    const [email] = s.google.emails;
    expect(email).toMatchObject({
      to: ['ana@exemplo.com'],
      from: 'Trama <ola@trama.test>',
      subject: 'Não deu para copiar seus projetos para o Drive',
    });
    expect(email?.html).toContain('Olá, Ana.');
    expect(email?.html).toContain(`href="${SITE}"`);
    expect(s.drive.connection?.lastError).toMatch(/Não deu para copiar/);

    // A quarta falha não manda outro e-mail.
    await s.post(`/drive/projects/${project.id}/copy`);
    expect(s.google.emails).toHaveLength(1);
    expect(s.drive.connection?.consecutiveFailures).toBe(4);
    const status = driveStatusSchema.parse(await (await s.call('/drive/status')).json());
    expect(status.consecutiveFailures).toBe(4);
  });

  it('um sucesso zera a contagem; três falhas seguidas depois avisam de novo', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    s.google.state.driveDown = true;
    await s.post(`/drive/projects/${project.id}/copy`);
    await s.post(`/drive/projects/${project.id}/copy`);
    s.google.state.driveDown = false;
    expect((await s.post(`/drive/projects/${project.id}/copy`)).status).toBe(200);
    expect(s.drive.connection?.consecutiveFailures).toBe(0);
    expect(s.drive.connection?.lastError).toBeNull();

    s.google.state.driveDown = true;
    for (let i = 0; i < 3; i++) await s.post(`/drive/projects/${project.id}/copy`);
    expect(s.google.emails).toHaveLength(1);
  });

  it('no máximo um aviso por dia, mesmo zerando as falhas ou reconectando', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    const failThreeTimes = async () => {
      s.google.state.driveDown = true;
      for (let i = 0; i < 3; i++) await s.post(`/drive/projects/${project.id}/copy`);
    };
    await failThreeTimes();
    expect(s.google.emails).toHaveLength(1);

    // Sucesso, reconexão e mais três falhas no mesmo dia: nenhum e-mail novo.
    s.google.state.driveDown = false;
    await s.post(`/drive/projects/${project.id}/copy`);
    await connect(s);
    await failThreeTimes();
    expect(s.google.emails).toHaveLength(1);

    // No dia seguinte, o aviso volta a valer.
    s.clock.now = new Date(s.clock.now.getTime() + 25 * 60 * 60 * 1000);
    s.google.state.driveDown = false;
    await s.post(`/drive/projects/${project.id}/copy`);
    await failThreeTimes();
    expect(s.google.emails).toHaveLength(2);
  });

  it('acesso revogado no Google conta como falha e pede para conectar de novo', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    s.google.state.revoked = true;
    const response = await s.post(`/drive/projects/${project.id}/copy`);
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toMatch(/Conecte o Drive de novo/);
    expect(s.drive.connection?.consecutiveFailures).toBe(1);
  });

  it('falha do Resend ou falta de chave não derruba a resposta da cópia', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s);
    s.google.state.driveDown = true;
    s.google.state.resendDown = true;
    for (let i = 0; i < 3; i++) {
      expect((await s.post(`/drive/projects/${project.id}/copy`)).status).toBe(502);
    }
    expect(s.google.emails).toHaveLength(0);

    const bare = setup({ ...ENV, RESEND_API_KEY: undefined });
    await connect(bare);
    const other = await newProject(bare);
    bare.google.state.driveDown = true;
    for (let i = 0; i < 3; i++) await bare.post(`/drive/projects/${other.id}/copy`);
    expect(bare.google.emails).toHaveLength(0);
  });
});

describe('Picker e "Abrir do Drive"', () => {
  it('dá um token de acesso curto para o Picker, sem guardar nada', async () => {
    const s = setup();
    expect((await s.post('/drive/picker-token')).status).toBe(409);
    await connect(s);
    const response = await s.post('/drive/picker-token');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessToken: 'at-2', expiresIn: 3599 });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('importa um projeto.trama válido como projeto novo, ligado ao arquivo do Drive', async () => {
    const s = setup();
    await connect(s);
    const source = await newProject(s, 'Veio do Drive');
    const file = s.google.addFile(
      'projeto.trama',
      JSON.stringify(
        createTramaFile(
          {
            ...source,
            content: flowContentSchema.parse(source.content),
            id: crypto.randomUUID(),
          },
          '2026-11-20T10:00:00.000Z',
        ),
      ),
    );
    const response = await s.post('/drive/import', { fileId: file.id });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { projectId: string; created: boolean };
    expect(result.created).toBe(true);
    const created = await s.projects.get(result.projectId);
    expect(created).toMatchObject({ title: 'Veio do Drive', driveFileId: file.id });
    expect(flowContentSchema.parse(created?.content).blocks.length).toBe(
      videoFlowExample.blocks.length,
    );
  });

  it('se o projeto já existe, o arquivo vence e o conteúdo de antes vai para o histórico', async () => {
    const s = setup();
    await connect(s);
    const project = await newProject(s, 'Original');
    const edited = createTramaFile(
      {
        ...project,
        title: 'Editado no Drive',
        content: flowContentSchema.parse({
          ...videoFlowExample,
          blocks: [],
          frames: [],
          arrows: [],
          presentation: [],
        }),
      },
      '2026-11-20T10:00:00.000Z',
    );
    const file = s.google.addFile('projeto.trama', JSON.stringify(edited));
    const response = await s.post('/drive/import', { fileId: file.id });
    expect(await response.json()).toEqual({
      projectId: project.id,
      created: false,
      replacedPrevious: true,
    });
    const after = await s.projects.get(project.id);
    expect(after).toMatchObject({ title: 'Editado no Drive', revision: 2, driveFileId: file.id });
    expect(flowContentSchema.parse(after?.content).blocks).toHaveLength(0);
    const versions = await s.projects.versions(project.id);
    expect(versions?.map((v) => v.reason)).toContain('conflict');
    expect(s.projects.projects.size).toBe(1);
  });

  it('recusa arquivo que não é um projeto do Trama, grande demais, ou que o app não enxerga', async () => {
    const s = setup();
    await connect(s);
    const broken = s.google.addFile('projeto.trama', '{ não é json');
    const wrong = s.google.addFile('outro.trama', JSON.stringify({ format: 'trama', version: 1 }));
    const huge = s.google.addFile('grande.trama', 'x'.repeat(6 * 1024 * 1024));
    const r1 = await s.post('/drive/import', { fileId: broken.id });
    expect(r1.status).toBe(422);
    expect(((await r1.json()) as { error: string }).error).toMatch(/não é um projeto do Trama/);
    expect((await s.post('/drive/import', { fileId: wrong.id })).status).toBe(422);
    expect((await s.post('/drive/import', { fileId: huge.id })).status).toBe(413);
    expect((await s.post('/drive/import', { fileId: 'arquivoquenaoexiste1' })).status).toBe(404);
    // Id com cara de caminho nem chega ao Google.
    expect((await s.post('/drive/import', { fileId: '../about' })).status).toBe(400);
    expect((await s.post('/drive/import', {})).status).toBe(400);
    expect(s.projects.projects.size).toBe(0);
  });

  it('recusa fluxo com referência quebrada (o core valida)', async () => {
    const s = setup();
    await connect(s);
    const source = await newProject(s);
    const file = createTramaFile(
      { ...source, content: flowContentSchema.parse(source.content), id: crypto.randomUUID() },
      '2026-11-20T10:00:00.000Z',
    );
    const broken = {
      ...file,
      content: {
        ...file.content,
        arrows: [{ id: 'a1', from: { nodeId: 'x1' }, to: { nodeId: 'x2' } }],
      },
    };
    const drive = s.google.addFile('projeto.trama', JSON.stringify(broken));
    expect((await s.post('/drive/import', { fileId: drive.id })).status).toBe(422);
    expect(s.projects.projects.size).toBe(1);
  });
});

describe('e-mail de boas-vindas', () => {
  it('sai na primeira chamada e não repete nas seguintes', async () => {
    const s = setup();
    const first = await s.post('/account/welcome');
    expect(await first.json()).toEqual({ sent: true });
    expect(s.google.emails).toHaveLength(1);
    expect(s.google.emails[0]).toMatchObject({
      to: ['ana@exemplo.com'],
      subject: 'Boas-vindas ao Trama',
    });
    expect(s.google.emails[0]?.html).toContain('Boas-vindas ao Trama, <!-- -->Ana');
    expect(await (await s.post('/account/welcome')).json()).toEqual({ sent: false });
    expect(await (await s.post('/account/welcome')).json()).toEqual({ sent: false });
    expect(s.google.emails).toHaveLength(1);
  });

  it('exige login', async () => {
    const s = setup();
    expect((await s.post('/account/welcome', undefined, null)).status).toBe(401);
  });

  it('se o envio falha, devolve a reserva e a próxima chamada tenta de novo', async () => {
    const s = setup();
    s.google.state.resendDown = true;
    expect((await s.post('/account/welcome')).status).toBe(502);
    expect(s.welcome.sent).toBe(false);
    s.google.state.resendDown = false;
    expect(await (await s.post('/account/welcome')).json()).toEqual({ sent: true });
  });

  it('falhas seguidas no envio param na terceira tentativa (a cota de e-mails é de todos)', async () => {
    const s = setup();
    s.google.state.resendDown = true;
    for (let i = 0; i < 3; i++) expect((await s.post('/account/welcome')).status).toBe(502);
    s.google.state.resendDown = false;
    expect(await (await s.post('/account/welcome')).json()).toEqual({ sent: false });
    expect(s.welcome.attempts).toBe(3);
  });

  it('sem Resend configurado não gasta a reserva', async () => {
    const s = setup({ ...ENV, RESEND_API_KEY: undefined });
    expect(await (await s.post('/account/welcome')).json()).toEqual({ sent: false });
    expect(s.welcome.sent).toBe(false);
  });
});

describe('jwtSubject', () => {
  it('lê o sub do token e recusa o que não é token', () => {
    expect(jwtSubject(tokenOf(ANA))).toBe(ANA.id);
    expect(jwtSubject('lixo')).toBeNull();
    expect(jwtSubject('a.!!.c')).toBeNull();
  });
});
