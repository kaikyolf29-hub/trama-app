import { localMedia, type CanvasMedia } from '@trama/canvas';
import { createContext, useContext } from 'react';
import type { AccountApi, DriveApi } from './api/drive-api';
import { DRIVE_COPY_INTERVAL } from './api/drive-copier';
import { AUTOSAVE_DELAY } from './api/autosave';
import type { AgendaApi } from './api/agenda-api';
import type { LessonsApi } from './api/lessons-api';
import type { ProjectsApi } from './api/projects-api';
import type { PickDriveFile } from './drive/picker';

/** O que as telas usam fora do login: a API de projetos e onde guardar imagens. */
export interface Services {
  /** null quando o site não tem a API configurada (VITE_API_URL). */
  projects: ProjectsApi | null;
  /** Eventos da Agenda (null sem API configurada, como `projects`). */
  agenda: AgendaApi | null;
  /** Aulas dos cadernos de Estudos (null sem API configurada). */
  lessons: LessonsApi | null;
  /** Google Drive (conectar, copiar, abrir); null quando o site não tem a API. */
  drive: DriveApi | null;
  /** E-mail de boas-vindas; null quando o site não tem a API. */
  account: AccountApi | null;
  /** O seletor de arquivos do Google; null quando faltam a chave de API e o ID do cliente. */
  pickDriveFile: PickDriveFile | null;
  /** Imagens do quadro de uma pessoa (Supabase Storage); sem armazenamento, ficam na aba. */
  mediaFor: (userId: string) => CanvasMedia;
  /** Espera antes de salvar sozinho; os testes encurtam. */
  autosaveDelay: number;
  /** Intervalo da cópia para o Drive; os testes encurtam. */
  driveCopyInterval: number;
  /** Leva o navegador a outro site (a tela de consentimento do Google); os testes trocam. */
  redirectTo: (url: string) => void;
}

export const defaultServices: Services = {
  projects: null,
  agenda: null,
  lessons: null,
  drive: null,
  account: null,
  pickDriveFile: null,
  mediaFor: () => localMedia,
  autosaveDelay: AUTOSAVE_DELAY,
  driveCopyInterval: DRIVE_COPY_INTERVAL,
  redirectTo: (url) => window.location.assign(url),
};

export const ServicesContext = createContext<Services>(defaultServices);

export function useServices(): Services {
  return useContext(ServicesContext);
}
