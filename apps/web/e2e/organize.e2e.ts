import type { Page } from '@playwright/test';
import { flowContentSchema } from '@trama/core';
import { expect, test } from './support/fixtures';
import { installFakeWhisper } from './support/voice';

/**
 * "Falar e organizar" de ponta a ponta (etapa 3.3, tela 5): fala (microfone e Whisper falsos),
 * a estimativa, organizar (a API de IA é simulada, nenhum provedor é chamado), a
 * pré-visualização e "Inserir no quadro". Veja `voice.e2e.ts` para a gravação em si.
 */
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
});

const SPEECH = 'o jogo é de plataforma, o personagem é uma raposa, não, um gato sem memória';

/** Grava uns segundos com o microfone de mentira e espera o texto chegar na caixa. */
async function speak(page: Page) {
  await page.getByRole('button', { name: 'Gravar' }).click();
  await expect(page.getByText(/^Gravando · 00:0[2-9]$/)).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => window.__finishModelLoad?.());
  await page.getByRole('button', { name: 'Parar de gravar' }).click();
  await expect(page.getByRole('textbox', { name: /Transcrição/ })).toHaveValue(SPEECH);
}

test.describe('Falar e organizar: a IA', () => {
  test('fala, vê a estimativa, organiza, confere a pré-visualização e insere no quadro', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    await installFakeWhisper(page, [SPEECH]);
    const project = api.seed({ title: 'Sem título' });
    await page.goto(`/p/${project.id}/falar`);

    // A IA escolhida vem de Configurações; sem texto ainda não há o que organizar.
    const settings = page.getByRole('link', { name: 'Claude · claude-haiku-5-5' });
    await expect(settings).toHaveAttribute('href', '/configuracoes');
    await expect(page.getByRole('button', { name: 'Organizar', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Inserir no quadro' })).toBeDisabled();

    await speak(page);

    // A estimativa vem antes de enviar, sem gastar nada: só /ai/estimate foi chamado.
    await expect(page.getByText(/Estimativa antes de enviar: cerca de 900 tokens/)).toBeVisible();
    expect(api.callsTo('POST', '/ai/estimate').length).toBeGreaterThan(0);
    expect(api.callsTo('POST', '/ai/organize')).toHaveLength(0);

    await page.getByRole('button', { name: 'Organizar', exact: true }).click();
    const result = page.getByTestId('result');
    await expect(result).toBeVisible();
    const preview = result.getByTestId('flow-preview');
    await expect(preview).toHaveAccessibleName(/8 blocos, 3 molduras e 3 setas/);
    await expect(preview.getByText('Gato perdeu a memória')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Correções que a IA percebeu' })).toContainText(
      'Você trocou “raposa” por “gato”',
    );

    // A pré-visualização é o layout que vai para o quadro: nada se sobrepõe nela.
    const boxes = await preview
      .locator('[data-node="block"], [data-node="frame"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const { left, top, width, height } = (node as HTMLElement).style;
          return {
            kind: (node as HTMLElement).dataset.node,
            x: parseFloat(left),
            y: parseFloat(top),
            width: parseFloat(width),
            height: parseFloat(height),
          };
        }),
      );
    const blocks = boxes.filter((box) => box.kind === 'block');
    for (const [i, a] of blocks.entries()) {
      for (const b of blocks.slice(i + 1)) {
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }

    await page.getByRole('button', { name: 'Inserir no quadro' }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${project.id}$`));
    await expect(page.getByText('Gato perdeu a memória').first()).toBeVisible();

    // Gravou pela API, com a revisão lida na hora, e tudo validado pelo core.
    const saved = api.lastSave(project.id);
    expect(saved?.baseRevision).toBe(1);
    expect(saved?.title).toBe('O gato sem memória');
    const content = flowContentSchema.parse(saved?.content);
    expect(content.blocks).toHaveLength(8);
    expect(content.frames.map((frame) => frame.title)).toEqual([
      'História',
      'Mecânicas',
      'A decidir',
    ]);
    expect(content.arrows).toHaveLength(3);
    for (const node of [...content.blocks, ...content.frames]) {
      expect(node.position.x % 8).toBe(0);
      expect(node.position.y % 8).toBe(0);
    }
  });

  test('o que já estava no quadro fica onde estava, e a IA entra abaixo', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    await installFakeWhisper(page, [SPEECH]);
    const project = api.seed({
      title: 'Ideia do jogo',
      content: flowContentSchema.parse({
        schemaVersion: 1,
        blocks: [
          {
            id: 'ja-estava',
            type: 'sticky',
            position: { x: 80, y: 80 },
            size: { width: 160, height: 152 },
            text: 'Já estava aqui',
          },
        ],
      }),
    });
    await page.goto(`/p/${project.id}/falar`);
    await speak(page);
    await page.getByRole('button', { name: 'Organizar', exact: true }).click();
    await page.getByRole('button', { name: 'Inserir no quadro' }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${project.id}$`));

    const saved = flowContentSchema.parse(api.lastSave(project.id)?.content);
    expect(api.lastSave(project.id)?.title).toBeUndefined();
    const old = saved.blocks.find((block) => block.id === 'ja-estava');
    expect(old?.position).toEqual({ x: 80, y: 80 });
    for (const added of saved.blocks.filter((block) => block.id !== 'ja-estava')) {
      expect(added.position.y).toBeGreaterThanOrEqual(80 + 152);
    }
  });

  test('roteiro: mostra as cenas e cria um projeto roteiro', async ({ page, api, signIn }) => {
    await signIn();
    await installFakeWhisper(page, [SPEECH]);
    const project = api.seed();
    await page.goto(`/p/${project.id}/falar`);
    await speak(page);
    await page.getByRole('button', { name: 'Roteiro', exact: true }).click();
    await page.getByRole('button', { name: 'Organizar', exact: true }).click();
    const preview = page.getByTestId('script-preview');
    await expect(preview.getByText('Gancho')).toBeVisible();
    await expect(preview.getByText('Duração alvo: 8 min')).toBeVisible();

    await page.getByRole('button', { name: 'Criar roteiro' }).click();
    await expect(
      page.getByText(/Roteiro “O gato sem memória: apresentando o jogo” criado/),
    ).toBeVisible();
    expect(api.scripts).toHaveLength(1);
    expect(api.scripts[0]?.content.scenes.map((scene) => scene.title)).toEqual([
      'Gancho',
      'A história',
    ]);
    // O quadro do projeto não mudou.
    expect(api.callsTo('PUT', `/projects/${project.id}`)).toHaveLength(0);
  });

  test('prompt: copia o prompt organizado', async ({ page, api, signIn }) => {
    await signIn();
    await installFakeWhisper(page, [SPEECH]);
    const project = api.seed();
    await page.goto(`/p/${project.id}/falar`);
    await speak(page);
    await page.getByRole('button', { name: 'Prompt organizado' }).click();
    await page.getByRole('button', { name: 'Organizar', exact: true }).click();
    await expect(page.getByTestId('result').getByText('Objetivo')).toBeVisible();
    await page.getByRole('button', { name: 'Copiar prompt' }).click();
    await expect(page.getByText('Prompt copiado.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      '## Objetivo\n\nEscrever o roteiro de um vídeo de culinária.',
    );
  });

  test('chave recusada: mostra a frase da API e leva às Configurações; limite de uso deixa tentar de novo', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    await installFakeWhisper(page, [SPEECH]);
    const project = api.seed();
    api.aiFailures.push(
      {
        status: 422,
        code: 'key_rejected',
        message: 'O Claude recusou a chave. Confira se ela está ativa.',
      },
      { status: 429, code: 'provider_rate_limited', message: 'O Claude pediu para esperar.' },
    );
    await page.goto(`/p/${project.id}/falar`);
    await speak(page);

    await page.getByRole('button', { name: 'Organizar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'O Claude recusou a chave. Confira se ela está ativa.',
    );
    await expect(page.getByRole('link', { name: 'Abrir Configurações' })).toHaveAttribute(
      'href',
      '/configuracoes',
    );
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeHidden();

    await page.getByRole('button', { name: 'Refazer' }).click();
    await expect(page.getByRole('alert')).toHaveText('O Claude pediu para esperar.');
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByTestId('result')).toBeVisible();
    expect(api.callsTo('POST', '/ai/organize')).toHaveLength(3);
  });

  test('sem chave guardada: avisa e não deixa organizar', async ({ page, api, signIn }) => {
    await signIn();
    await installFakeWhisper(page, [SPEECH]);
    api.aiKeys = [];
    const project = api.seed();
    await page.goto(`/p/${project.id}/falar`);
    await expect(page.getByText('Falta a chave do Claude')).toBeVisible();
    await speak(page);
    await expect(page.getByRole('button', { name: 'Organizar', exact: true })).toBeDisabled();
    expect(api.callsTo('POST', '/ai/estimate')).toHaveLength(0);
  });
});
