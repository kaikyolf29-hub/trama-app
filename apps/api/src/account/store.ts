import type { Profile, UpdateProfileRequest } from '@trama/core';

/**
 * Onde o perfil mora, do ponto de vista das rotas. A versão de verdade fala com o Supabase com o
 * token da pessoa (a RLS deixa ver e mudar só o perfil dela); os testes usam uma em memória.
 * `null` quer dizer "esta pessoa não tem perfil".
 */
export interface AccountStore {
  getProfile(): Promise<Profile | null>;
  /** Muda só o que veio no pedido e devolve o perfil já atualizado. */
  updateProfile(patch: UpdateProfileRequest): Promise<Profile | null>;
}
