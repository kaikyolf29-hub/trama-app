import { localMedia, type CanvasMedia } from '@trama/canvas';
import { createContext, useContext } from 'react';
import { AUTOSAVE_DELAY } from './api/autosave';
import type { AgendaApi } from './api/agenda-api';
import type { LessonsApi } from './api/lessons-api';
import type { ProjectsApi } from './api/projects-api';

/** O que as telas usam fora do login: as APIs (projetos, Agenda, aulas) e onde guardar imagens. */
export interface Services {
  /** null quando o site não tem a API configurada (VITE_API_URL). */
  projects: ProjectsApi | null;
  /** Eventos da Agenda (null sem API configurada, como `projects`). */
  agenda: AgendaApi | null;
  /** Aulas dos cadernos de Estudos (null sem API configurada). */
  lessons: LessonsApi | null;
  /** Imagens do quadro de uma pessoa (Supabase Storage); sem armazenamento, ficam na aba. */
  mediaFor: (userId: string) => CanvasMedia;
  /** Espera antes de salvar sozinho; os testes encurtam. */
  autosaveDelay: number;
}

export const defaultServices: Services = {
  projects: null,
  agenda: null,
  lessons: null,
  mediaFor: () => localMedia,
  autosaveDelay: AUTOSAVE_DELAY,
};

export const ServicesContext = createContext<Services>(defaultServices);

export function useServices(): Services {
  return useContext(ServicesContext);
}
