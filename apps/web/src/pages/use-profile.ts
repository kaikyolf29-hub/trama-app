import type { Profile } from '@trama/core';
import { useCallback, useEffect, useState } from 'react';
import type { AccountApi } from '../api/account-api';
import { useServices } from '../services';

interface Loaded {
  account: AccountApi;
  /** null quando o perfil não veio (erro de rede, por exemplo). */
  profile: Profile | null;
}

/**
 * O perfil da pessoa (`GET /account/profile`), lido uma vez ao abrir a tela. O que as telas
 * mais usam dele é o fuso: a Agenda e os Estudos agrupam e mostram datas no fuso do perfil. Sem
 * API, ou se o perfil não chega, vale o fuso de reserva de `Services.timeZone`.
 */
export function useProfile() {
  const { account, timeZone: fallback } = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    account.getProfile().then(
      (profile) => alive && setLoaded({ account, profile }),
      () => alive && setLoaded({ account, profile: null }),
    );
    return () => {
      alive = false;
    };
  }, [account]);

  /** Troca o perfil guardado (depois de gravar uma preferência, por exemplo). */
  const setProfile = useCallback(
    (profile: Profile) => {
      if (account) setLoaded({ account, profile });
    },
    [account],
  );

  const current = account && loaded?.account === account ? loaded : null;
  return {
    account,
    profile: current?.profile ?? null,
    timeZone: current?.profile?.timezone ?? fallback,
    /** Verdadeiro enquanto o perfil ainda não chegou (nunca, sem API). */
    loading: account !== null && current === null,
    setProfile,
  };
}
