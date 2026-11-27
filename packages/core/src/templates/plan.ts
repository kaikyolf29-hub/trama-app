import type { FlowContentInput } from '../flow';

/**
 * Modelo "Plano de projeto": o projeto no alto e três molduras em fila: etapas, decisões e
 * tarefas. Posições e tamanhos na grade de 8 px.
 */
export const planTemplateContent = {
  schemaVersion: 1,
  frames: [
    {
      id: 'moldura-etapas',
      title: 'Etapas',
      position: { x: 112, y: 224 },
      size: { width: 320, height: 264 },
    },
    {
      id: 'moldura-decisoes',
      title: 'Decisões',
      position: { x: 480, y: 224 },
      size: { width: 320, height: 264 },
    },
    {
      id: 'moldura-tarefas',
      title: 'Tarefas',
      position: { x: 848, y: 224 },
      size: { width: 320, height: 264 },
    },
  ],
  blocks: [
    {
      id: 'cartao-projeto',
      type: 'card',
      position: { x: 112, y: 32 },
      size: { width: 320, height: 144 },
      tag: 'Projeto',
      title: 'Nome do projeto',
      description: 'O objetivo em uma frase',
      status: { label: 'Projeto pronto', done: false },
    },
    {
      id: 'etapas',
      type: 'checklist',
      frameId: 'moldura-etapas',
      position: { x: 144, y: 256 },
      size: { width: 256, height: 200 },
      title: 'Etapas',
      items: [
        { id: 'etapa-planejar', text: 'Planejar', done: false },
        { id: 'etapa-fazer', text: 'Fazer', done: false },
        { id: 'etapa-revisar', text: 'Revisar', done: false },
        { id: 'etapa-entregar', text: 'Entregar', done: false },
      ],
    },
    {
      id: 'decisao-1',
      type: 'sticky',
      frameId: 'moldura-decisoes',
      position: { x: 512, y: 256 },
      size: { width: 120, height: 152 },
      text: 'Decisão 1: o que ficou combinado',
      color: 'yellow',
    },
    {
      id: 'decisao-2',
      type: 'sticky',
      frameId: 'moldura-decisoes',
      position: { x: 648, y: 256 },
      size: { width: 120, height: 152 },
      text: 'Dúvida em aberto',
      color: 'blue',
    },
    {
      id: 'tarefas',
      type: 'checklist',
      frameId: 'moldura-tarefas',
      position: { x: 880, y: 256 },
      size: { width: 256, height: 168 },
      title: 'Tarefas',
      items: [
        { id: 'tarefa-1', text: 'Primeira tarefa', done: false },
        { id: 'tarefa-2', text: 'Segunda tarefa', done: false },
        { id: 'tarefa-3', text: 'Terceira tarefa', done: false },
      ],
    },
  ],
  arrows: [
    {
      id: 'seta-projeto-etapas',
      from: { nodeId: 'cartao-projeto', side: 'bottom' },
      to: { nodeId: 'moldura-etapas', side: 'top' },
    },
    {
      id: 'seta-etapas-decisoes',
      from: { nodeId: 'moldura-etapas', side: 'right' },
      to: { nodeId: 'moldura-decisoes', side: 'left' },
    },
    {
      id: 'seta-decisoes-tarefas',
      from: { nodeId: 'moldura-decisoes', side: 'right' },
      to: { nodeId: 'moldura-tarefas', side: 'left' },
    },
  ],
} satisfies FlowContentInput;
