import { describe, expect, it } from 'vitest';
import { chooseComputeDevice, deviceNotice, detectWebGpu } from './device';
import { classifyMicError, micErrorText } from './mic-errors';
import { formatDownloadSize, isVoiceModelId, VOICE_MODELS, voiceModelList } from './models';
import {
  formatElapsed,
  initialVoiceState,
  MAX_RECORDING_SECONDS,
  voiceReducer,
  WAVE_BARS,
  type VoiceEvent,
  type VoiceState,
} from './recording-state';
import { modelNotice, statusLines } from './status-text';
import { appendTranscript, cleanChunkText } from './text';
import { percentFromProgress } from './worker-protocol';

const run = (events: VoiceEvent[], from: VoiceState = initialVoiceState) =>
  events.reduce(voiceReducer, from);

describe('texto da transcrição', () => {
  it('arruma espaços e descarta o que não é fala', () => {
    expect(cleanChunkText('  então,   o jogo\n é  assim ')).toBe('então, o jogo é assim');
    expect(cleanChunkText('...')).toBe('');
    expect(cleanChunkText('[Música]')).toBe('');
    expect(cleanChunkText('(aplausos).')).toBe('');
    expect(cleanChunkText('[BLANK_AUDIO]')).toBe('');
    expect(cleanChunkText('Ele disse (baixinho) que sim')).toBe('Ele disse (baixinho) que sim');
  });

  it('junta os pedaços com um espaço e respeita o que a pessoa corrigiu', () => {
    expect(appendTranscript('', ' Olá ')).toBe('Olá');
    expect(appendTranscript('Olá', 'tudo bem?')).toBe('Olá tudo bem?');
    expect(appendTranscript('Olá\n', 'tudo bem?')).toBe('Olá\ntudo bem?');
    expect(appendTranscript('Olá', '[Música]')).toBe('Olá');
    expect(appendTranscript('   ', 'Oi')).toBe('Oi');
  });
});

describe('dispositivo', () => {
  it('WebGPU quando há, WASM quando não há', () => {
    expect(chooseComputeDevice({ webgpu: true })).toBe('webgpu');
    expect(chooseComputeDevice({ webgpu: false })).toBe('wasm');
  });

  it('detecta pela placa de vídeo e nunca lança', async () => {
    expect(await detectWebGpu({})).toBe(false);
    expect(await detectWebGpu(undefined)).toBe(false);
    expect(await detectWebGpu({ gpu: { requestAdapter: () => Promise.resolve({}) } })).toBe(true);
    expect(await detectWebGpu({ gpu: { requestAdapter: () => Promise.resolve(null) } })).toBe(
      false,
    );
    // Placa simulada por software (SwiftShader) não vale.
    const software = { info: { isFallbackAdapter: true } };
    expect(await detectWebGpu({ gpu: { requestAdapter: () => Promise.resolve(software) } })).toBe(
      false,
    );
    const real = { info: { isFallbackAdapter: false } };
    expect(await detectWebGpu({ gpu: { requestAdapter: () => Promise.resolve(real) } })).toBe(true);
    expect(
      await detectWebGpu({ gpu: { requestAdapter: () => Promise.reject(new Error('x')) } }),
    ).toBe(false);
  });

  it('só avisa de lentidão no WASM', () => {
    expect(deviceNotice('webgpu')).toBeNull();
    expect(deviceNotice('wasm')).toMatch(/mais lenta/);
  });
});

describe('modelos', () => {
  it('são os multilíngues (nunca os ".en") e o padrão é o base', () => {
    for (const model of voiceModelList) {
      expect(model.repo).toMatch(/^onnx-community\/whisper-(base|small)$/);
      expect(model.repo).not.toMatch(/\.en/);
    }
    expect(voiceModelList[0]?.id).toBe('base');
    expect(VOICE_MODELS.small.downloadMb.wasm).toBeGreaterThan(VOICE_MODELS.base.downloadMb.wasm);
  });

  it('reconhece os ids e formata o tamanho', () => {
    expect(isVoiceModelId('small')).toBe(true);
    expect(isVoiceModelId('tiny')).toBe(false);
    expect(formatDownloadSize(77)).toBe('cerca de 80 MB');
    expect(formatDownloadSize(586)).toBe('cerca de 590 MB');
  });
});

describe('erros do microfone', () => {
  it('traduz os erros do navegador', () => {
    const named = (name: string) => Object.assign(new Error('x'), { name });
    expect(classifyMicError(named('NotAllowedError'))).toBe('denied');
    expect(classifyMicError(named('NotFoundError'))).toBe('no-device');
    expect(classifyMicError(named('NotReadableError'))).toBe('busy');
    expect(classifyMicError(new Error('outro'))).toBe('unknown');
    expect(classifyMicError('texto')).toBe('unknown');
  });

  it('cada motivo tem uma explicação, e a de permissão diz como liberar', () => {
    expect(micErrorText.denied).toMatch(/cadeado/);
    for (const text of Object.values(micErrorText)) expect(text.length).toBeGreaterThan(20);
  });
});

describe('estados da gravação', () => {
  it('formata o tempo', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(134.9)).toBe('02:14');
    expect(formatElapsed(600)).toBe('10:00');
    expect(formatElapsed(3725)).toBe('1:02:05');
    expect(formatElapsed(-3)).toBe('00:00');
  });

  it('segue o caminho comum: pedir, gravar, parar, transcrever, voltar ao início', () => {
    let state = run([{ type: 'start' }]);
    expect(state.phase).toBe('starting');
    state = run([{ type: 'mic-ready' }, { type: 'audio', seconds: 2, level: 0.5 }], state);
    expect(state).toMatchObject({ phase: 'recording', seconds: 2 });
    state = run([{ type: 'chunk-queued' }, { type: 'stop' }], state);
    expect(state).toMatchObject({ phase: 'finishing', pending: 1 });
    state = run([{ type: 'chunk-done' }], state);
    expect(state).toMatchObject({ phase: 'idle', pending: 0 });
  });

  it('parar sem nada na fila volta direto ao início', () => {
    expect(run([{ type: 'start' }, { type: 'mic-ready' }, { type: 'stop' }]).phase).toBe('idle');
  });

  it('permissão negada volta ao início com o motivo, e uma nova tentativa limpa o erro', () => {
    let state = run([{ type: 'start' }, { type: 'mic-failed', kind: 'denied' }]);
    expect(state).toMatchObject({ phase: 'idle', micError: 'denied' });
    state = run([{ type: 'start' }], state);
    expect(state).toMatchObject({ phase: 'starting', micError: null });
  });

  it('não começa outra gravação enquanto uma está em andamento', () => {
    const recording = run([{ type: 'start' }, { type: 'mic-ready' }]);
    expect(voiceReducer(recording, { type: 'start' })).toBe(recording);
  });

  it('áudio fora da gravação é ignorado, e a onda guarda só as últimas barras', () => {
    expect(voiceReducer(initialVoiceState, { type: 'audio', seconds: 1, level: 1 })).toBe(
      initialVoiceState,
    );
    let state = run([{ type: 'start' }, { type: 'mic-ready' }]);
    for (let i = 0; i < WAVE_BARS + 10; i++)
      state = voiceReducer(state, { type: 'audio', seconds: i, level: i / 100 });
    expect(state.levels).toHaveLength(WAVE_BARS);
    expect(state.levels.at(-1)).toBeCloseTo((WAVE_BARS + 9) / 100);
  });

  it('trecho que falha conta, e o modelo passa por carregando, pronto e falha', () => {
    let state = run([
      { type: 'start' },
      { type: 'mic-ready' },
      { type: 'chunk-queued' },
      { type: 'chunk-failed' },
    ]);
    expect(state.failedChunks).toBe(1);
    state = run([{ type: 'model-loading', percent: 45 }], state);
    expect(state.model).toEqual({ status: 'loading', percent: 45 });
    state = run([{ type: 'model-failed', message: 'x' }], state);
    expect(state.model.status).toBe('failed');
    state = run([{ type: 'model-ready', device: 'wasm' }], state);
    expect(state.model).toEqual({ status: 'ready', device: 'wasm' });
  });

  it('descartar o que falta fecha a espera', () => {
    const state = run([
      { type: 'start' },
      { type: 'mic-ready' },
      { type: 'chunk-queued' },
      { type: 'chunk-queued' },
      { type: 'stop' },
      { type: 'discard' },
    ]);
    expect(state).toMatchObject({ phase: 'idle', pending: 0 });
  });

  it('o limite é de 10 minutos', () => {
    expect(MAX_RECORDING_SECONDS).toBe(600);
    expect(run([{ type: 'limit' }]).limitReached).toBe(true);
  });
});

describe('textos de estado', () => {
  const recording = run([
    { type: 'start' },
    { type: 'mic-ready' },
    { type: 'audio', seconds: 134, level: 0 },
  ]);

  it('mostra o tempo gravando, como na tela 5', () => {
    expect(statusLines(recording, false).title).toBe('Gravando · 02:14');
    expect(statusLines(recording, false).hint).toMatch(/voltar atrás, mudar de ideia/);
  });

  it('muda a dica do início quando já há texto', () => {
    expect(statusLines(initialVoiceState, false).hint).toMatch(/fale do jeito que vier/);
    expect(statusLines(initialVoiceState, true).hint).toMatch(/fim do texto/);
  });

  it('diz quantos trechos faltam', () => {
    const finishing = run(
      [{ type: 'chunk-queued' }, { type: 'chunk-queued' }, { type: 'stop' }],
      recording,
    );
    expect(statusLines(finishing, true).hint).toMatch(/Faltam 2 trechos/);
  });

  it('o aviso do modelo mostra a porcentagem do download', () => {
    expect(modelNotice({ status: 'loading', percent: 45 })).toBe(
      'Baixando o modelo de voz, só na primeira vez: 45%',
    );
    expect(modelNotice({ status: 'loading', percent: null })).toMatch(/Preparando/);
    expect(modelNotice({ status: 'loading', percent: 100 })).toMatch(/Preparando/);
    expect(modelNotice({ status: 'failed', message: 'x' })).toMatch(/Não deu para carregar/);
    expect(modelNotice({ status: 'ready', device: 'wasm' })).toBeNull();
    expect(modelNotice({ status: 'idle' })).toBeNull();
  });
});

describe('progresso do download', () => {
  it('lê só o aviso do total e arredonda', () => {
    expect(percentFromProgress({ status: 'progress_total', progress: 44.6 })).toBe(45);
    expect(percentFromProgress({ status: 'progress_total', progress: 140 })).toBe(100);
    expect(percentFromProgress({ status: 'progress', progress: 50, file: 'a' })).toBeNull();
    expect(percentFromProgress({ status: 'progress_total', progress: Number.NaN })).toBeNull();
    expect(percentFromProgress(null)).toBeNull();
    expect(percentFromProgress('x')).toBeNull();
  });
});

describe('detectWebGpu no jsdom', () => {
  it('sem navigator.gpu, não há WebGPU', async () => {
    expect(await detectWebGpu()).toBe(false);
  });
});
