import type { DriveStatus } from '@trama/core';
import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../services';

export type DriveState =
  | { state: 'loading' }
  | { state: 'ready'; status: DriveStatus }
  | { state: 'failed'; message: string };

/** O estado da conexão com o Drive. `setStatus` deixa a tela trocar o estado sem pedir de novo. */
export function useDriveStatus() {
  const { drive } = useServices();
  const [value, setValue] = useState<DriveState>({ state: 'loading' });

  const refresh = useCallback(() => {
    if (!drive) return () => undefined;
    let alive = true;
    drive.status().then(
      (status) => alive && setValue({ state: 'ready', status }),
      (error: unknown) =>
        alive &&
        setValue({
          state: 'failed',
          message:
            error instanceof Error ? error.message : 'Não deu para ver o estado do Google Drive.',
        }),
    );
    return () => {
      alive = false;
    };
  }, [drive]);

  useEffect(() => refresh(), [refresh]);

  return {
    value,
    refresh,
    setStatus: (status: DriveStatus) => setValue({ state: 'ready', status }),
  };
}
