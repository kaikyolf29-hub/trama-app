import { eventLabel, type AgendaEvent, type EventType } from '@trama/core';
import {
  CreatedIcon,
  DoneIcon,
  NoteIcon,
  PencilIcon,
  ReviewIcon,
  StudyIcon,
} from '@trama/ui/icons';
import type { ComponentType } from 'react';

interface EventStyle {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Fundo e texto da etiqueta no calendário (cores das notas e de "concluído"). */
  chip: string;
  /** Cor do título no painel do dia. */
  title: string;
  /** Pontinho do dia no calendário em tela estreita. */
  dot: string;
}

/** Cada tipo tem um ícone e uma cor: azul cria e edita, verde conclui, amarelo estuda. */
export const eventStyles: Record<EventType, EventStyle> = {
  created: {
    icon: CreatedIcon,
    chip: 'bg-note-blue-bg text-note-blue-fg',
    title: 'text-text-strong',
    dot: 'bg-note-blue-fg',
  },
  edited: {
    icon: PencilIcon,
    chip: 'bg-note-blue-bg text-note-blue-fg',
    title: 'text-text-strong',
    dot: 'bg-note-blue-fg',
  },
  completed: {
    icon: DoneIcon,
    chip: 'bg-done-surface text-done-text',
    title: 'text-done-text',
    dot: 'bg-done-text',
  },
  studied: {
    icon: StudyIcon,
    chip: 'bg-note-yellow-bg text-note-yellow-fg',
    title: 'text-text-strong',
    dot: 'bg-note-yellow-fg',
  },
  reviewed: {
    icon: ReviewIcon,
    chip: 'bg-note-yellow-bg text-note-yellow-fg',
    title: 'text-text-strong',
    dot: 'bg-note-yellow-fg',
  },
  note: {
    icon: NoteIcon,
    chip: 'bg-hover text-text',
    title: 'text-text-strong',
    dot: 'bg-text-muted',
  },
};

/** A primeira linha do evento: "Fluxo criado", "Aula estudada" ou o texto da anotação. */
export function eventHeadline(event: AgendaEvent): string {
  return event.type === 'note' ? event.title : eventLabel(event);
}

/** A segunda linha: o nome do projeto (e do caderno, numa aula) ou o detalhe da anotação. */
export function eventSubline(event: AgendaEvent): string {
  const parts = event.type === 'note' ? [event.detail] : [event.title, event.detail];
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

/**
 * Para onde o clique no evento leva. Só os fluxos têm tela hoje (`/p/<id>`); roteiros e cadernos
 * ganham a deles nas etapas 2.3 e 2.4, e uma anotação sem projeto não leva a lugar nenhum.
 */
export function openableProjectId(event: AgendaEvent): string | null {
  return event.projectId !== null && event.projectKind === 'flow' ? event.projectId : null;
}
