import type { ComputeDevice } from './device';

/**
 * Os modelos de voz. Sempre os Whisper multilíngues: os ".en" só entendem inglês e não servem
 * para português.
 */
export type VoiceModelId = 'base' | 'small';

export interface VoiceModel {
  id: VoiceModelId;
  /** O que a pessoa lê no menu "Transcrição". */
  label: string;
  /** O repositório no Hugging Face (versão ONNX do Whisper, para o Transformers.js). */
  repo: string;
  /** Precisão de cada parte do modelo (`dtype`) em cada tipo de dispositivo. */
  dtype: Record<ComputeDevice, Record<string, string>>;
  /** Tamanho do download (MB), conferido nos arquivos do repositório. */
  downloadMb: Record<ComputeDevice, number>;
}

// Receita do exemplo oficial do Transformers.js: codificador completo e decodificador em
// 4 bits na placa de vídeo; tudo em 8 bits no processador.
const DTYPE = {
  webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' },
};

export const VOICE_MODELS: Record<VoiceModelId, VoiceModel> = {
  base: {
    id: 'base',
    label: 'Whisper local · grátis',
    repo: 'onnx-community/whisper-base',
    dtype: DTYPE,
    downloadMb: { webgpu: 206, wasm: 77 },
  },
  small: {
    id: 'small',
    label: 'Whisper local · mais preciso',
    repo: 'onnx-community/whisper-small',
    dtype: DTYPE,
    downloadMb: { webgpu: 586, wasm: 249 },
  },
};

export const DEFAULT_VOICE_MODEL: VoiceModelId = 'base';

export const voiceModelList: readonly VoiceModel[] = [VOICE_MODELS.base, VOICE_MODELS.small];

export function isVoiceModelId(value: string): value is VoiceModelId {
  return value === 'base' || value === 'small';
}

/** "cerca de 80 MB", arredondando para a dezena. */
export function formatDownloadSize(mb: number): string {
  return `cerca de ${Math.max(10, Math.round(mb / 10) * 10)} MB`;
}
