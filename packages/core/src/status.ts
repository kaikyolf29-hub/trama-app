import { z } from 'zod';

/** Data e hora ISO 8601 com fuso (ex.: 2026-11-12T14:32:00-03:00). */
export const dateTimeSchema = z.iso.datetime({ offset: true });

/** Status de um projeto (fluxo, roteiro ou caderno). */
export const projectStatusSchema = z.enum(['draft', 'in_progress', 'done']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: 'Rascunho',
  in_progress: 'Em andamento',
  done: 'Concluído',
};

export const DEFAULT_BADGE_LABEL = 'Vídeo pronto';

/**
 * Selo de status dentro de um cartão (ex.: "Vídeo pronto" na tela 1).
 * Marcar registra data e hora, que alimentam a Agenda.
 * Regra: `doneAt` existe se, e só se, `done` é true.
 */
export const statusBadgeSchema = z
  .object({
    label: z.string().trim().min(1).max(40).default(DEFAULT_BADGE_LABEL),
    done: z.boolean().default(false),
    doneAt: dateTimeSchema.optional(),
  })
  .refine((badge) => badge.done === (badge.doneAt !== undefined), {
    message: 'doneAt deve existir quando, e só quando, done é true',
    path: ['doneAt'],
  });

export type StatusBadge = z.infer<typeof statusBadgeSchema>;

/** Marca ou desmarca o selo, registrando a hora em que foi marcado. */
export function setBadgeDone(
  badge: StatusBadge,
  done: boolean,
  now: Date = new Date(),
): StatusBadge {
  if (done) {
    return {
      ...badge,
      done: true,
      doneAt: badge.done && badge.doneAt ? badge.doneAt : now.toISOString(),
    };
  }
  const { doneAt: _removed, ...rest } = badge;
  return { ...rest, done: false };
}
