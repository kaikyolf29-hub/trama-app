import type { AiScriptOutput } from '@trama/core';
import { COMMON_CONTEXT, CORRECTIONS_RULE, OUTPUT_RULE, renderExample } from './shared';
import type { OrganizePrompt } from './shared';

const example: OrganizePrompt<AiScriptOutput>['example'] = {
  input:
    'Quero um vídeo de uns oito minutos sobre o meu jogo, o gato sem memória, que no começo eu falei raposa mas é gato. Abre com uma pergunta: e se você acordasse sem lembrar de nada? Mostra o gato na janela, um close nos olhos dele. Depois eu explico a história, cada fase é uma lembrança, e mostro uns trechos do jogo rodando. Aqui tem que ter uma música calma por baixo. No fim eu peço pra pessoa comentar qual fase achou melhor e falo do canal.',
  output: {
    title: 'O gato sem memória: apresentando o jogo',
    targetDuration: '8 min',
    scenes: [
      {
        title: 'Gancho',
        time: null,
        narration: 'E se você acordasse sem lembrar de nada?',
        broll: ['Gato na janela', 'Close nos olhos do gato'],
        notes: null,
      },
      {
        title: 'A história',
        time: null,
        narration: 'Explicar a história: cada fase do jogo é uma lembrança do gato.',
        broll: ['Trechos do jogo rodando'],
        notes: 'Música calma por baixo.',
      },
      {
        title: 'Fechamento',
        time: null,
        narration: 'Pedir para a pessoa comentar qual fase achou melhor e falar do canal.',
        broll: [],
        notes: null,
      },
    ],
    corrections: [{ from: 'raposa', to: 'gato' }],
  },
};

/** Roteiro: cenas com título, fala, B-roll e notas, em sequência. */
export const scriptPrompt: OrganizePrompt<AiScriptOutput> = {
  id: 'script',
  version: 1,
  example,
  system: `${COMMON_CONTEXT}

<objetivo>
Transforme a fala em um ROTEIRO de vídeo: uma lista de cenas, na ordem em que aparecem. Cada cena tem um título, o que é dito, o que se mostra (B-roll) e anotações de direção.
</objetivo>

<como_organizar>
1. Dê ao roteiro um título curto (até 60 caracteres). Se a pessoa falou a duração do vídeo ("uns oito minutos"), escreva em "targetDuration" em poucas palavras ("8 min"); senão, use null.
2. Separe a fala em cenas, na ordem em que a pessoa quer que apareçam, mesmo que ela tenha contado fora de ordem. Em geral entre 3 e 15 cenas, e no máximo 60. Uma cena é um momento do vídeo: abertura, uma explicação, uma demonstração, o fechamento.
3. Em cada cena:
   - "title": curto, até 6 palavras ("Gancho", "A história", "Fechamento").
   - "narration": o que é dito nessa cena. Use as palavras da pessoa quando ela disser a fala exata; quando ela só descrever ("explicar a história"), escreva a descrição, sem inventar o texto que ela não disse. Vazio ("") se a fala não trouxer nada.
   - "broll": o que se mostra ou se filma (planos, imagens, trechos de tela), um item por linha, curto. Lista vazia se a fala não disser.
   - "notes": direção e anotações que não são fala nem imagem (música, tom, ritmo, lembretes). null se não houver.
   - "time": marcação de tempo ("0:00-0:15") só quando a pessoa falou o tempo daquela cena; senão, null. Nunca calcule tempos por conta própria.
4. Não crie cena que a pessoa não mencionou (por exemplo, uma abertura ou um fechamento que ela não pediu), e não repita o conteúdo de uma cena em outra.
</como_organizar>

${CORRECTIONS_RULE}

${OUTPUT_RULE}

${renderExample(example.input, example.output)}`,
};
