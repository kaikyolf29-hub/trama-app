import { createAccountApi } from './api/account-api';
import { createAgendaApi } from './api/agenda-api';
import { createDriveApi } from './api/drive-api';
import { createLessonsApi } from './api/lessons-api';
import { createNotebooksApi } from './api/notebooks-api';
import { createProjectsApi } from './api/projects-api';
import { createSupabaseAuthClient } from './auth/supabase-client';
import type { AuthClient } from './auth/types';
import { createUnconfiguredAuthClient } from './auth/unconfigured-client';
import { appIdFromClientId, createPicker } from './drive/picker';
import { defaultServices, type Services } from './services';
import { createSupabaseMedia, filesBucket } from './storage/supabase-media';
import { createSupabase, type Supabase } from './supabase';

export interface Backend {
  auth: AuthClient;
  /** null quando o apps/web/.env não tem o Supabase (o site abre, mas sem login). */
  supabase: Supabase | null;
  services: Services;
}

/** Cria o login, a API de projetos e os arquivos a partir do apps/web/.env (veja o .env.example). */
export function createBackendFromEnv(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const apiUrl = import.meta.env.VITE_API_URL;
  const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
  if (!url || !key) {
    return { auth: createUnconfiguredAuthClient(), supabase: null, services: defaultServices };
  }
  const supabase = createSupabase(url, key);
  const auth = createSupabaseAuthClient(supabase, appUrl);
  const bucket = filesBucket(supabase);
  const api = apiUrl ? { baseUrl: apiUrl, getToken: () => auth.getAccessToken() } : null;
  // O Picker precisa da chave de API (restrita a ele) e do número do projeto do Google Cloud.
  const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const googleAppId =
    import.meta.env.VITE_GOOGLE_APP_ID || appIdFromClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  return {
    auth,
    supabase,
    services: {
      ...defaultServices,
      projects: api ? createProjectsApi(api) : null,
      agenda: api ? createAgendaApi(api) : null,
      lessons: api ? createLessonsApi(api) : null,
      notebooks: api ? createNotebooksApi(api) : null,
      drive: api ? createDriveApi(api) : null,
      account: api ? createAccountApi(api) : null,
      pickDriveFile:
        googleApiKey && googleAppId
          ? createPicker({ apiKey: googleApiKey, appId: googleAppId })
          : null,
      mediaFor: (userId) => createSupabaseMedia(bucket, userId),
    },
  };
}
