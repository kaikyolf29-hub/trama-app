import { createScene, scriptContentSchema, type ScriptContent } from '../script';

/**
 * Modelo "Roteiro de vídeo" da tela Início, na versão em texto (tela 3): quatro cenas com o
 * tempo, a fala de exemplo, o B-roll e uma nota de direção. Cada chamada devolve um roteiro
 * novo, com ids novos, para dois roteiros nunca dividirem cena.
 */
export function scriptDocTemplateContent(): ScriptContent {
  return scriptContentSchema.parse({
    targetDuration: '8–10 min',
    scenes: [
      createScene({
        title: 'Gancho',
        time: '0:00–0:15',
        narration: 'A frase que prende nos primeiros 15 segundos.',
        broll: ['Antes e depois, sem explicar nada'],
        notes: 'Abra com o resultado, não com a apresentação.',
      }),
      createScene({
        title: 'Desenvolvimento',
        time: '0:15–3:00',
        narration: 'O assunto, em partes curtas.',
        broll: ['Tela do passo a passo'],
        notes: 'Uma ideia por parte.',
      }),
      createScene({
        title: 'Exemplo',
        time: '3:00–6:00',
        narration: 'Mostre na prática, com um caso de verdade.',
        broll: ['Gravação de tela'],
        notes: '',
      }),
      createScene({
        title: 'Fechamento',
        time: '6:00–7:00',
        narration: 'Resumo e chamada para a ação.',
        broll: [],
        notes: '',
      }),
    ],
  });
}
