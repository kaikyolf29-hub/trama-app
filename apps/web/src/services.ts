import { localMedia, type CanvasMedia } from '@trama/canvas';
import { createContext, useContext } from 'react';
import { AUTOSAVE_DELAY } from './api/autosave';
import type { AccountApi } from './api/account-api';
import type { ProjectsApi } from './api/projects-api';

/** O que as telas usam fora do login: a API de projetos e onde guardar imagens. */
export interface Services {
  /** null quando o site não tem a API configurada (VITE_API_URL). */
  projects: ProjectsApi | null;
  /** Perfil da pessoa (Configurações); null quando o site não tem a API configurada. */
  account: AccountApi | null;
  /** Imagens do quadro de uma pessoa (Supabase Storage); sem armazenamento, ficam na aba. */
  mediaFor: (userId: string) => CanvasMedia;
  /** Espera antes de salvar sozinho; os testes encurtam. */
  autosaveDelay: number;
}

export const defaultServices: Services = {
  projects: null,
  account: null,
  mediaFor: () => localMedia,
  autosaveDelay: AUTOSAVE_DELAY,
};

export const ServicesContext = createContext<Services>(defaultServices);

export function useServices(): Services {
  return useContext(ServicesContext);
}
