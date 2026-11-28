import type { AiScriptOutput } from './ai';
import { clipText } from './ai-flow';
import { scriptContentSchema, type ScriptContent } from './script';

/**
 * Da saída da IA para um roteiro (etapa 3.3). Cada cena da saída vira uma `Scene` com id novo;
 * texto maior que o limite do esquema é cortado (a IA que erra um tamanho não derruba a
 * inserção), e itens de B-roll vazios saem. O roteiro nasce sem fluxo vinculado: quem liga é a
 * pessoa, no próprio roteiro.
 */

export interface AiScriptOptions {
  /** Gera o id de cada cena. Os testes trocam por um contador. */
  newId?: () => string;
}

export function aiOutputToScript(
  output: AiScriptOutput,
  options: AiScriptOptions = {},
): ScriptContent {
  const newId = options.newId ?? (() => crypto.randomUUID());
  return scriptContentSchema.parse({
    targetDuration: clipText(output.targetDuration?.trim() ?? '', 40),
    scenes: output.scenes.map((scene) => ({
      id: newId(),
      title: clipText(scene.title.trim(), 200),
      time: clipText(scene.time?.trim() ?? '', 40),
      narration: clipText(scene.narration.trim(), 20000),
      broll: scene.broll
        .map((item) => item.trim())
        .filter((item) => item !== '')
        .map((item) => clipText(item, 500)),
      notes: clipText(scene.notes?.trim() ?? '', 20000),
    })),
  });
}
