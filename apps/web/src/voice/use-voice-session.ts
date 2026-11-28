import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ComputeDevice } from './device';
import type { VoiceModelId } from './models';
import { initialVoiceState, type VoiceState } from './recording-state';
import type { VoiceServices } from './services';
import { VoiceSession } from './session';

const noSubscribe = () => () => undefined;
const idleState = () => initialVoiceState;

/** O dispositivo (WebGPU ou WASM), descoberto uma vez ao abrir a tela; null até saber. */
export function useComputeDevice(services: VoiceServices): ComputeDevice | null {
  const [device, setDevice] = useState<ComputeDevice | null>(null);
  useEffect(() => {
    let alive = true;
    void services.detectDevice().then((found) => alive && setDevice(found));
    return () => {
      alive = false;
    };
  }, [services]);
  return device;
}

/**
 * Liga a tela a uma `VoiceSession`. A sessão (e o Worker do Whisper) só existe depois que o
 * dispositivo é conhecido, é recriada ao trocar de modelo e é encerrada ao sair da tela.
 */
export function useVoiceSession(options: {
  services: VoiceServices;
  model: VoiceModelId;
  device: ComputeDevice | null;
  onText: (text: string) => void;
}): { session: VoiceSession | null; state: VoiceState } {
  const { services, model, device } = options;
  const [session, setSession] = useState<VoiceSession | null>(null);
  const onText = useRef(options.onText);
  useEffect(() => {
    onText.current = options.onText;
  });

  useEffect(() => {
    if (!device) return;
    const created = new VoiceSession({
      recorder: services.createRecorder(),
      transcriber: services.createTranscriber(),
      model,
      device,
      chunkLimits: services.chunkLimits,
      onText: (text) => onText.current(text),
    });
    setSession(created);
    return () => {
      created.dispose();
      setSession(null);
    };
  }, [services, model, device]);

  const state = useSyncExternalStore(
    session ? session.subscribe : noSubscribe,
    session ? session.getState : idleState,
  );
  return { session, state };
}
