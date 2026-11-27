import { createAccountApi } from './api/account-api';
import { createProjectsApi } from './api/projects-api';
import { createSupabaseAuthClient } from './auth/supabase-client';
import type { AuthClient } from './auth/types';
import { createUnconfiguredAuthClient } from './auth/unconfigured-client';
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
  return {
    auth,
    supabase,
    services: {
      ...defaultServices,
      projects: apiUrl
        ? createProjectsApi({ baseUrl: apiUrl, getToken: () => auth.getAccessToken() })
        : null,
      account: apiUrl
        ? createAccountApi({ baseUrl: apiUrl, getToken: () => auth.getAccessToken() })
        : null,
      mediaFor: (userId) => createSupabaseMedia(bucket, userId),
    },
  };
}
