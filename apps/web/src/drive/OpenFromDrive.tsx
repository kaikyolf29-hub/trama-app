import { useNavigate } from '@tanstack/react-router';
import { Alert, Button } from '@trama/ui';
import { useState } from 'react';
import { useServices } from '../services';

/**
 * "Abrir do Drive": pede um token curto à API, abre o seletor de arquivos do Google (o script
 * do Google só carrega neste clique), manda o arquivo escolhido para a API validar e abre o
 * projeto no quadro. Sem o seletor configurado, o botão fica desligado e diz o porquê.
 */
export function OpenFromDriveButton({ className }: { className?: string }) {
  const { drive, pickDriveFile } = useServices();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'picking' | 'importing' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!drive) return null;

  const open = async () => {
    if (!pickDriveFile) return;
    setError(null);
    setBusy('picking');
    try {
      const { accessToken } = await drive.pickerToken();
      const fileId = await pickDriveFile({ accessToken });
      if (!fileId) return setBusy(null);
      setBusy('importing');
      const imported = await drive.importFile(fileId);
      await navigate({ to: '/p/$projectId', params: { projectId: imported.projectId } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não deu para abrir do Drive.');
      setBusy(null);
    }
  };

  return (
    <div className={className}>
      <Button
        variant="secondary"
        loading={busy !== null}
        disabled={!pickDriveFile}
        title={pickDriveFile ? undefined : 'O seletor do Google Drive ainda não está ligado.'}
        onClick={() => void open()}
      >
        {busy === 'importing' ? 'Abrindo o projeto…' : 'Abrir do Drive'}
      </Button>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  );
}
