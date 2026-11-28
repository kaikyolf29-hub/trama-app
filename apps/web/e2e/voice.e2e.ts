import { getFlowTemplate } from '@trama/core';
import { expect, test } from './support/fixtures';
import { installFakeWhisper } from './support/voice';

/**
 * Tela "Falar e organizar" (etapa 3.2, tela 5). O microfone é o de mentira do Chromium
 * (`--use-fake-device-for-media-stream`, que toca bipes) e o Whisper é um transcritor falso
 * definido antes da página carregar (`window.__TRAMA_VOICE_TEST__`): nada baixa o modelo de
 * verdade, e o resultado não depende da internet.
 */
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
});

test.describe('Falar e organizar', () => {
  test('o modelo "Falar e organizar" do Início cria o projeto e abre a tela de voz', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    await installFakeWhisper(page, []);
    await page.goto('/');
    await page.getByRole('button', { name: /Falar e organizar/ }).click();

    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}\/falar$/);
    const [project] = [...api.projects.values()];
    expect(project?.title).toBe(getFlowTemplate('voice').projectTitle);
    await expect(page.getByRole('heading', { level: 1, name: 'Falar e organizar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gravar' })).toBeVisible();
  });

  test('só entra logado', async ({ page }) => {
    await page.goto('/p/6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f/falar');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('grava, mostra o progresso do modelo, o texto, deixa corrigir e copiar', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    await installFakeWhisper(page, ['o personagem é uma raposa']);
    const project = api.seed({ title: 'Ideia do jogo' });
    await page.goto(`/p/${project.id}/falar`);

    await expect(page.getByRole('link', { name: 'Ideia do jogo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Claude · claude-haiku-5-5' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inserir no quadro' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Copiar texto' })).toBeDisabled();

    await page.getByRole('button', { name: 'Gravar' }).click();
    await expect(page.getByText(/^Gravando · 00:0\d$/)).toBeVisible();
    await expect(page.getByText('Baixando o modelo de voz, só na primeira vez: 45%')).toBeVisible();
    // O aviso de lentidão aparece sem WebGPU (o gancho de teste força WASM).
    await expect(page.getByText(/fica mais lenta/)).toBeVisible();

    // O tempo anda enquanto grava.
    await expect(page.getByText(/^Gravando · 00:0[2-9]$/)).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => window.__finishModelLoad?.());
    await expect(page.getByText(/Baixando o modelo de voz/)).toBeHidden();

    await page.getByRole('button', { name: 'Parar de gravar' }).click();
    const text = page.getByRole('textbox', { name: /Transcrição/ });
    await expect(text).toHaveValue('o personagem é uma raposa');
    await expect(page.getByText('Pronto para gravar')).toBeVisible();
    expect(await page.evaluate(() => window.__heard?.length)).toBe(1);
    // O áudio chegou ao Whisper em 16 kHz: uns 2 a 10 s de fala, e nunca mais que 20 s.
    const samples = await page.evaluate(() => window.__heard?.[0] ?? 0);
    expect(samples).toBeGreaterThan(16_000);
    expect(samples).toBeLessThan(16_000 * 20);

    // Corrige à mão.
    await text.fill('o personagem é um gato');
    await expect(text).toHaveValue('o personagem é um gato');

    // Copia o texto corrigido.
    await page.getByRole('button', { name: 'Copiar texto' }).click();
    await expect(page.getByText('Copiado')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'o personagem é um gato',
    );

    // Nada disso mexe no fluxo salvo.
    expect(api.callsTo('PUT', `/projects/${project.id}`)).toHaveLength(0);
  });

  test('permissão negada explica como liberar', async ({ page, api, signIn }) => {
    await signIn();
    await installFakeWhisper(page, []);
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    const project = api.seed();
    await page.goto(`/p/${project.id}/falar`);
    await page.getByRole('button', { name: 'Gravar' }).click();
    await expect(page.getByRole('alert')).toContainText('cadeado');
    await expect(page.getByRole('button', { name: 'Gravar' })).toBeEnabled();
  });

  test('sem microfone, avisa', async ({ page, api, signIn }) => {
    await signIn();
    await installFakeWhisper(page, []);
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    });
    const project = api.seed();
    await page.goto(`/p/${project.id}/falar`);
    await page.getByRole('button', { name: 'Gravar' }).click();
    await expect(page.getByRole('alert')).toContainText('Não encontramos um microfone');
  });
});
