import { describe, expect, it, vi } from 'vitest';
import { createFakeRecorder, createFakeTranscriber } from '../test/fake-voice';
import { WHISPER_SAMPLE_RATE } from './audio';
import { VoiceSession } from './session';

function setup(transcriberOptions: Parameters<typeof createFakeTranscriber>[0] = {}, extra = {}) {
  const recorder = createFakeRecorder();
  const transcriber = createFakeTranscriber(transcriberOptions);
  const texts: string[] = [];
  const session = new VoiceSession({
    recorder: recorder.recorder,
    transcriber: transcriber.transcriber,
    model: 'base',
    device: 'wasm',
    onText: (text) => texts.push(text),
    ...extra,
  });
  return { recorder, transcriber, texts, session };
}

/** Deixa as promessas pendentes terminarem. */
const settle = () => vi.waitFor(() => undefined, { timeout: 20 }).catch(() => undefined);
const idle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await settle();
};

describe('VoiceSession', () => {
  it('grava, reamostra e entrega o texto do último pedaço ao parar', async () => {
    const { recorder, transcriber, texts, session } = setup({ texts: ['olá mundo'] });
    await session.start();
    expect(session.getState().phase).toBe('recording');
    recorder.speak(2);
    expect(session.getState().seconds).toBeCloseTo(2, 1);
    await session.stop();
    await vi.waitFor(() => expect(session.getState().phase).toBe('idle'));

    expect(texts).toEqual(['olá mundo']);
    expect(transcriber.heard).toHaveLength(1);
    // 48 kHz virou 16 kHz: dois segundos são 32 mil amostras.
    expect(Math.abs(transcriber.heard[0]!.length - 2 * WHISPER_SAMPLE_RATE)).toBeLessThanOrEqual(2);
  });

  it('o modelo carrega junto com a fala e mostra o progresso do download', async () => {
    const { recorder, transcriber, session } = setup({ progress: [10, 45, 100] });
    const percents: (number | null)[] = [];
    session.subscribe(() => {
      const { model } = session.getState();
      if (model.status === 'loading') percents.push(model.percent);
    });
    await session.start();
    recorder.speak(1);
    await vi.waitFor(() => expect(session.getState().model.status).toBe('ready'));
    expect(transcriber.load).toHaveBeenCalledTimes(1);
    expect(transcriber.load).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'base', device: 'wasm' }),
    );
    expect(percents).toEqual(expect.arrayContaining([10, 45, 100]));
  });

  it('em gravação longa o texto sai aos poucos, antes de parar, e na ordem', async () => {
    const { recorder, texts, session } = setup(
      { texts: ['primeiro', 'segundo', 'terceiro'] },
      { chunkLimits: { minSeconds: 3, maxSeconds: 5 } },
    );
    await session.start();
    for (let second = 0; second < 12; second++) recorder.speak(1);
    await vi.waitFor(() => expect(texts.length).toBeGreaterThanOrEqual(2));
    // Ainda gravando: o texto já apareceu.
    expect(session.getState().phase).toBe('recording');
    expect(texts.slice(0, 2)).toEqual(['primeiro', 'segundo']);
    await session.stop();
    await vi.waitFor(() => expect(session.getState().phase).toBe('idle'));
    expect(texts).toEqual(['primeiro', 'segundo', 'terceiro']);
  });

  it('silêncio e pedaços curtos não vão para o Whisper', async () => {
    const { recorder, transcriber, session } = setup();
    await session.start();
    recorder.stayQuiet(3);
    await session.stop();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(session.getState().phase).toBe('idle');

    await session.start();
    recorder.speak(0.2);
    await session.stop();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
  });

  it('para sozinha no limite de tempo e avisa', async () => {
    const { recorder, session } = setup({}, { maxSeconds: 2 });
    await session.start();
    recorder.speak(1);
    expect(session.getState().phase).toBe('recording');
    recorder.speak(1.2);
    await vi.waitFor(() => expect(session.getState().phase).not.toBe('recording'));
    expect(session.getState().limitReached).toBe(true);
    await vi.waitFor(() => expect(session.getState().phase).toBe('idle'));
  });

  it('permissão negada vira estado, sem lançar', async () => {
    const { recorder, transcriber, session } = setup();
    recorder.failNextStart('denied');
    await session.start();
    expect(session.getState()).toMatchObject({ phase: 'idle', micError: 'denied' });
    // Sem microfone, não baixa o modelo à toa.
    expect(transcriber.load).not.toHaveBeenCalled();
  });

  it('microfone desconectado no meio: o que foi gravado é transcrito e o aviso aparece', async () => {
    const { recorder, texts, session } = setup({ texts: ['pedaço'] });
    await session.start();
    recorder.speak(2);
    recorder.unplug();
    await vi.waitFor(() => expect(texts).toEqual(['pedaço']));
    await vi.waitFor(() => expect(session.getState().micError).toBe('lost'));
    expect(session.getState().phase).toBe('idle');
  });

  it('um pedaço que falha é contado e os outros seguem', async () => {
    const { recorder, texts, session } = setup(
      { failChunk: 0, texts: ['x', 'depois'] },
      { chunkLimits: { minSeconds: 1, maxSeconds: 2 } },
    );
    await session.start();
    for (let i = 0; i < 5; i++) recorder.speak(1);
    await session.stop();
    await vi.waitFor(() => expect(session.getState().phase).toBe('idle'));
    expect(session.getState().failedChunks).toBe(1);
    expect(texts.length).toBeGreaterThan(0);
  });

  it('se o modelo não carrega, os trechos esperam e "tentar de novo" os transcreve', async () => {
    const { recorder, texts, session } = setup({
      failLoadOnce: 'sem internet',
      texts: ['recuperado'],
    });
    await session.start();
    recorder.speak(2);
    await session.stop();
    await vi.waitFor(() => expect(session.getState().model.status).toBe('failed'));
    expect(session.getState()).toMatchObject({ phase: 'finishing', pending: 1 });
    expect(texts).toEqual([]);

    session.retryModel();
    await vi.waitFor(() => expect(session.getState().phase).toBe('idle'));
    expect(texts).toEqual(['recuperado']);
    expect(session.getState().model.status).toBe('ready');
  });

  it('descartar o que falta libera a tela', async () => {
    const { recorder, session } = setup({ failLoadOnce: 'sem internet' });
    await session.start();
    recorder.speak(2);
    await session.stop();
    await vi.waitFor(() => expect(session.getState().model.status).toBe('failed'));
    session.discard();
    expect(session.getState()).toMatchObject({ phase: 'idle', pending: 0 });
  });

  it('dispose encerra o transcritor e o microfone, e para de avisar', async () => {
    const { recorder, transcriber, session } = setup();
    const listener = vi.fn();
    await session.start();
    session.subscribe(listener);
    session.dispose();
    await idle();
    expect(transcriber.dispose).toHaveBeenCalled();
    expect(recorder.stop).toHaveBeenCalled();
    recorder.speak(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
