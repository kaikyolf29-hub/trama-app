import { appendFileSync } from 'node:fs';
import { board } from './support/board';
import { expect, test } from './support/fixtures';
import { bigFlow } from './support/flows';
import { round, startFrameCounter, stopFrameCounter, type FrameStats } from './support/perf';

/**
 * Meta do plano (docs/PLAN.md, "O que deixa o quadro premium"): 60 quadros por segundo com 500
 * blocos. No CI não há placa de vídeo (o Chromium desenha por software), então o teste só
 * reprova abaixo de limites mais folgados; o número real de cada rodada vai no relatório.
 * Os limites podem ser mudados por variável de ambiente (docs/DECISIONS.md, etapa 1.9).
 */
const LIMITS = {
  /** Tempo máximo, em ms, da navegação até os 500 blocos desenhados. */
  openMs: Number(process.env.E2E_PERF_OPEN_MS ?? 4000),
  /** Média mínima de quadros por segundo durante o pan e o zoom. */
  cameraFps: Number(process.env.E2E_PERF_CAMERA_FPS ?? 24),
  /** Média mínima de quadros por segundo durante o arraste de um bloco. */
  dragFps: Number(process.env.E2E_PERF_DRAG_FPS ?? 20),
};
/** Para simular uma máquina mais lenta: `E2E_PERF_CPU_THROTTLE=4` deixa o processador 4x mais lento. */
const CPU_THROTTLE = Number(process.env.E2E_PERF_CPU_THROTTLE ?? 1);
const GOAL_FPS = 60;
const BLOCKS = 500;
/** 500 blocos + 25 molduras. */
const NODES = BLOCKS + Math.ceil(BLOCKS / 20);
const MEASURE_MS = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe('desempenho com 500 blocos', () => {
  test('abre rápido e mantém os quadros por segundo no pan, no zoom e no arraste', async ({
    page,
    api,
    signIn,
  }, testInfo) => {
    if (CPU_THROTTLE > 1) {
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    }
    const flow = bigFlow(BLOCKS);
    expect(flow.blocks).toHaveLength(BLOCKS);
    expect(flow.frames).toHaveLength(25);
    expect(new Set(flow.blocks.map((block) => block.type)).size).toBeGreaterThanOrEqual(6);
    const project = api.seed({ title: 'Quadro grande', content: flow });
    await signIn();

    // Anota, de dentro da página, quando o primeiro nó e o último nó apareceram.
    await page.addInitScript((expected) => {
      const marks = { firstNode: 0, allNodes: 0 };
      (window as unknown as { __marks: typeof marks }).__marks = marks;
      const check = () => {
        const count = document.querySelectorAll('.react-flow__node').length;
        if (count > 0 && !marks.firstNode) marks.firstNode = performance.now();
        if (count >= expected && !marks.allNodes) {
          marks.allNodes = performance.now();
          observer.disconnect();
        }
      };
      const observer = new MutationObserver(check);
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.documentElement, { childList: true, subtree: true });
      });
    }, NODES);

    await page.goto(`/p/${project.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(NODES, { timeout: 20_000 });
    const marks = await page.evaluate(
      () => (window as unknown as { __marks: { firstNode: number; allNodes: number } }).__marks,
    );
    // Tudo medido em ms desde o início da navegação (inclui carregar o site e a API simulada).
    const openMs = marks.allNodes;
    await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();

    await expect(board.edges(page)).toHaveCount(flow.arrows.length);
    const transform = () =>
      page.locator('.react-flow__viewport').evaluate((el) => (el as HTMLElement).style.transform);
    const opened = await transform();

    // Esquenta: o primeiro movimento paga o JIT e o primeiro desenho dos blocos.
    await page.mouse.move(720, 450);
    await page.keyboard.press('h');
    await board.drag(page, { x: 720, y: 450 }, { x: 760, y: 470 }, 8);
    await sleep(300);

    // 1) Pan (mão) e zoom (roda) por alguns segundos.
    await startFrameCounter(page);
    const cameraEnd = Date.now() + MEASURE_MS;
    let tick = 0;
    await page.mouse.move(720, 450);
    await page.mouse.down();
    while (Date.now() < cameraEnd) {
      tick++;
      const angle = tick / 6;
      await page.mouse.move(720 + Math.cos(angle) * 200, 450 + Math.sin(angle) * 160);
      // A cada 12 passos, um giro de roda: aproxima e depois afasta.
      if (tick % 12 === 0) await page.mouse.wheel(0, (tick / 12) % 2 === 0 ? 200 : -200);
    }
    await page.mouse.up();
    const camera = await stopFrameCounter(page);
    // Conferência: a câmera de fato andou (senão os quadros medidos seriam de uma tela parada).
    expect(await transform()).not.toBe(opened);

    // 2) Arrasta um bloco (as guias de alinhamento comparam com os 525 nós a cada passo).
    await page.keyboard.press('v');
    await page.getByRole('button', { name: 'Ajustar' }).click();
    await sleep(500);
    const block = board.node(page, 'bloco-210');
    await block.scrollIntoViewIfNeeded();
    const start = await board.center(block);
    const before = await block.boundingBox();
    await startFrameCounter(page);
    const dragEnd = Date.now() + MEASURE_MS;
    tick = 0;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    while (Date.now() < dragEnd) {
      tick++;
      const angle = tick / 6;
      await page.mouse.move(start.x + Math.cos(angle) * 40, start.y + Math.sin(angle) * 30);
    }
    await page.mouse.up();
    const drag = await stopFrameCounter(page);
    // Conferência: o bloco saiu do lugar.
    const after = await block.boundingBox();
    expect(after).not.toEqual(before);

    const numbers = {
      blocks: BLOCKS,
      nodes: NODES,
      arrows: flow.arrows.length,
      openMs: round(openMs, 0),
      firstNodeMs: round(marks.firstNode, 0),
      camera: roundStats(camera),
      drag: roundStats(drag),
      cpuThrottle: CPU_THROTTLE,
      goalFps: GOAL_FPS,
      limits: LIMITS,
    };
    // Aparece na saída do terminal, no relatório HTML e no artefato do CI.
    console.log(`[desempenho] ${JSON.stringify(numbers)}`);
    await testInfo.attach('desempenho.json', {
      body: JSON.stringify(numbers, null, 2),
      contentType: 'application/json',
    });

    // No GitHub Actions, os números também vão para o resumo da execução.
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          '### Desempenho do quadro com 500 blocos',
          '',
          '| Medida | Resultado | Limite | Meta do plano |',
          '| --- | --- | --- | --- |',
          `| Abrir o quadro | ${numbers.openMs} ms | menos de ${LIMITS.openMs} ms | - |`,
          `| Pan e zoom | ${camera.avgFps.toFixed(1)} fps (piores 5%: ${camera.p5Fps.toFixed(1)}) | ${LIMITS.cameraFps} fps | ${GOAL_FPS} fps |`,
          `| Arrastar um bloco | ${drag.avgFps.toFixed(1)} fps (piores 5%: ${drag.p5Fps.toFixed(1)}) | ${LIMITS.dragFps} fps | ${GOAL_FPS} fps |`,
          '',
        ].join('\n'),
      );
    }

    expect(openMs, `abertura: ${round(openMs, 0)} ms`).toBeLessThan(LIMITS.openMs);
    expect(camera.avgFps, `pan e zoom: ${round(camera.avgFps)} fps`).toBeGreaterThanOrEqual(
      LIMITS.cameraFps,
    );
    expect(drag.avgFps, `arraste: ${round(drag.avgFps)} fps`).toBeGreaterThanOrEqual(
      LIMITS.dragFps,
    );

    // O quadro continua inteiro: nada sumiu e o bloco arrastado se moveu e foi salvo.
    await expect(page.locator('.react-flow__node')).toHaveCount(NODES);
    await expect.poll(() => api.saves.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(api.lastSave(project.id)?.content.blocks).toHaveLength(BLOCKS);
  });
});

function roundStats(stats: FrameStats) {
  return {
    frames: stats.frames,
    seconds: round(stats.durationMs / 1000, 1),
    avgFps: round(stats.avgFps),
    p5Fps: round(stats.p5Fps),
    worstFrameMs: round(stats.worstFrameMs, 0),
    longFrames: stats.longFrames,
  };
}
