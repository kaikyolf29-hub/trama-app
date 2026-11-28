import { describe, expect, it } from 'vitest';
import { createProjectRequestSchema } from '../api';
import { flowContentSchema } from '../flow';
import { GRID_SIZE } from '../geometry';
import {
  createProjectRequestFromTemplate,
  flowTemplateIdSchema,
  flowTemplates,
  getFlowTemplate,
} from './index';

const onGrid = (value: number) => value % GRID_SIZE === 0;

describe('modelos de início', () => {
  it('são os seis do plano, na ordem da tela 4', () => {
    expect(flowTemplates.map((item) => item.id)).toEqual([
      'blank',
      'lesson',
      'video',
      'plan',
      'script',
      'voice',
    ]);
    expect(flowTemplates.map((item) => item.id).sort()).toEqual(
      [...flowTemplateIdSchema.options].sort(),
    );
    expect(flowTemplates.map((item) => item.title)).toEqual([
      'Fluxo em branco',
      'Aula por etapas',
      'Fluxo de vídeo',
      'Plano de projeto',
      'Roteiro de vídeo',
      'Falar e organizar',
    ]);
  });

  it.each(flowTemplates.map((item) => [item.id, item] as const))(
    '%s: tem texto, é um fluxo e vira um pedido de criação válido',
    (_id, item) => {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.kind).toBe('flow');
      expect(flowContentSchema.safeParse(item.content()).success).toBe(true);
      const request = createProjectRequestSchema.parse(createProjectRequestFromTemplate(item));
      expect(request.title).toBe(item.projectTitle);
      expect(request.content).toEqual(item.content());
    },
  );

  it.each(flowTemplates.map((item) => [item.id, item] as const))(
    '%s: posições e tamanhos ficam na grade de 8 px',
    (_id, item) => {
      const flow = item.content();
      for (const node of [...flow.blocks, ...flow.frames]) {
        expect(
          [node.position.x, node.position.y, node.size.width, node.size.height].every(onGrid),
          node.id,
        ).toBe(true);
      }
    },
  );

  it.each(flowTemplates.map((item) => [item.id, item] as const))(
    '%s: cada bloco cabe dentro da sua moldura',
    (_id, item) => {
      const flow = item.content();
      for (const block of flow.blocks) {
        if (block.frameId === undefined) continue;
        const frame = flow.frames.find((candidate) => candidate.id === block.frameId);
        expect(frame, block.id).toBeDefined();
        if (!frame) continue;
        expect(block.position.x, block.id).toBeGreaterThanOrEqual(frame.position.x);
        expect(block.position.y, block.id).toBeGreaterThanOrEqual(frame.position.y);
        expect(block.position.x + block.size.width, block.id).toBeLessThanOrEqual(
          frame.position.x + frame.size.width,
        );
        expect(block.position.y + block.size.height, block.id).toBeLessThanOrEqual(
          frame.position.y + frame.size.height,
        );
      }
    },
  );

  it.each(flowTemplates.map((item) => [item.id, item] as const))(
    '%s: nenhum bloco fora de moldura cai em cima de outro',
    (_id, item) => {
      const flow = item.content();
      const boxes = [...flow.blocks.filter((block) => block.frameId === undefined), ...flow.frames];
      boxes.forEach((a, i) => {
        boxes.slice(i + 1).forEach((b) => {
          const apart =
            a.position.x + a.size.width <= b.position.x ||
            b.position.x + b.size.width <= a.position.x ||
            a.position.y + a.size.height <= b.position.y ||
            b.position.y + b.size.height <= a.position.y;
          expect(apart, `${a.id} e ${b.id}`).toBe(true);
        });
      });
    },
  );

  it('devolve um fluxo novo a cada chamada, sem compartilhar nada', () => {
    const video = getFlowTemplate('video');
    const first = video.content();
    first.blocks.length = 0;
    expect(video.content().blocks.length).toBeGreaterThan(0);
  });

  it('o fluxo em branco não tem nada no quadro', () => {
    const flow = getFlowTemplate('blank').content();
    expect([flow.blocks, flow.frames, flow.arrows, flow.presentation]).toEqual([[], [], [], []]);
    expect(getFlowTemplate('blank').projectTitle).toBe('Sem título');
  });

  it('o fluxo de vídeo traz o selo "Vídeo pronto" ainda desmarcado, e as etapas', () => {
    const flow = getFlowTemplate('video').content();
    const card = flow.blocks.find((block) => block.type === 'card' && block.status);
    expect(card?.type === 'card' && card.status).toMatchObject({
      label: 'Vídeo pronto',
      done: false,
    });
    const steps = flow.blocks.find((block) => block.type === 'checklist');
    expect(steps?.type === 'checklist' && steps.items.every((item) => !item.done)).toBe(true);
    expect(flow.presentation.length).toBeGreaterThan(0);
  });

  it('a aula por etapas tem uma moldura por etapa, cada uma já um passo da aula', () => {
    const flow = getFlowTemplate('lesson').content();
    expect(flow.frames).toHaveLength(4);
    expect(flow.presentation).toHaveLength(4);
    expect(flow.presentation.map((step) => step.targetIds)).toEqual(
      flow.frames.map((frame) => [frame.id]),
    );
  });

  it('o plano de projeto tem molduras de etapas, decisões e tarefas', () => {
    const flow = getFlowTemplate('plan').content();
    expect(flow.frames.map((frame) => frame.title)).toEqual(['Etapas', 'Decisões', 'Tarefas']);
  });

  it('o roteiro em quadro põe as cenas em sequência, ligadas por setas', () => {
    const flow = getFlowTemplate('script').content();
    const scenes = flow.blocks.filter((block) => block.type === 'card');
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(flow.arrows).toHaveLength(scenes.length - 1);
    const xs = scenes.map((scene) => scene.position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('falar e organizar abre um quadro vazio: a voz e a IA ficam na tela de voz', () => {
    const flow = getFlowTemplate('voice').content();
    expect([flow.blocks, flow.frames, flow.arrows, flow.presentation]).toEqual([[], [], [], []]);
  });

  it('getFlowTemplate recusa um modelo que não existe', () => {
    // @ts-expect-error id fora da lista, de propósito
    expect(() => getFlowTemplate('nada')).toThrow();
  });
});
