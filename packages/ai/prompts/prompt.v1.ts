import type { AiPromptOutput } from '@trama/core';
import { COMMON_CONTEXT, CORRECTIONS_RULE, OUTPUT_RULE, renderExample } from './shared';
import type { OrganizePrompt } from './shared';

const example: OrganizePrompt<AiPromptOutput>['example'] = {
  input:
    'Eu queria um prompt pra uma IA me ajudar a escrever o roteiro dos meus vídeos de culinária. Meu canal é de receitas rápidas, uns cinco minutos, tom leve e engraçado. Quero que ela me devolva o roteiro com gancho, passo a passo e fechamento. Não quero palavras difíceis, meu público é jovem. Por exemplo, o gancho pode ser uma pergunta tipo, você sabia que dá pra fazer bolo no micro-ondas?',
  output: {
    title: 'Roteiros de vídeos de receitas rápidas',
    sections: [
      {
        heading: 'Objetivo',
        content:
          'Escrever o roteiro de um vídeo de culinária a partir do nome de uma receita que eu vou informar.',
      },
      {
        heading: 'Contexto',
        content:
          'Meu canal publica receitas rápidas, com vídeos de cerca de 5 minutos. O público é jovem, e o tom é leve e engraçado.',
      },
      {
        heading: 'Instruções',
        content:
          '- Comece com um gancho que prenda nos primeiros segundos.\n- Mostre o passo a passo da receita em frases curtas.\n- Termine com um fechamento curto.\n- Use palavras simples, sem termos difíceis.',
      },
      {
        heading: 'Exemplo',
        content: 'Um gancho possível: "Você sabia que dá para fazer bolo no micro-ondas?"',
      },
      {
        heading: 'Formato da resposta',
        content:
          'Devolva o roteiro em três partes, com estes títulos: Gancho, Passo a passo, Fechamento.',
      },
    ],
    corrections: [],
  },
};

/** Prompt organizado: a fala vira um prompt com seções, pronto para outra IA. */
export const promptPrompt: OrganizePrompt<AiPromptOutput> = {
  id: 'prompt',
  version: 1,
  example,
  system: `${COMMON_CONTEXT}

<objetivo>
Reescreva a fala como um PROMPT ORGANIZADO: um texto pronto para a pessoa colar numa IA. Você não executa o pedido da fala; você só escreve o melhor prompt para ele.
</objetivo>

<como_organizar>
1. Dê ao prompt um título curto (até 60 caracteres) que diga para que ele serve.
2. Escreva o prompt em seções, cada uma com "heading" e "content". Use só as seções que a fala sustenta, nesta ordem:
   - "Objetivo": o que a IA deve fazer, numa ou duas frases, no imperativo.
   - "Contexto": quem é a pessoa, para quem é o resultado, tom e situação.
   - "Instruções": os passos e as regras, em lista com "- ". O que fazer vem antes do que evitar, e cada regra diz o que fazer, não só o que não fazer.
   - "Exemplo": só se a fala trouxer um exemplo. Copie-o fielmente.
   - "Formato da resposta": como a resposta deve vir (partes, tamanho, tom), só se a fala disser.
3. Cada seção tem texto claro e direto, em segunda pessoa quando falar com a IA. Sem enrolação, sem repetir a mesma ideia em duas seções e sem frases como "você é um especialista" se a fala não pedir.
4. Se a fala deixar algo essencial em aberto, escreva na seção o ponto como o que a IA deve perguntar ou considerar, em vez de inventar uma resposta.
5. De uma a seis seções ao todo. Texto de cada seção em português do Brasil, a menos que a fala esteja em outro idioma.
</como_organizar>

${CORRECTIONS_RULE}

${OUTPUT_RULE}

${renderExample(example.input, example.output)}`,
};
