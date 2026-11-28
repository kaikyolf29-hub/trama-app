import type { AiFlowOutput } from '@trama/core';
import { COMMON_CONTEXT, CORRECTIONS_RULE, OUTPUT_RULE, renderExample } from './shared';
import type { OrganizePrompt } from './shared';

const example: OrganizePrompt<AiFlowOutput>['example'] = {
  input:
    'Então, quero fazer um vídeo sobre como cuidar de uma raposa, quer dizer, de um gato filhote. Primeiro eu mostro o que comprar, ração, caixa de areia e uma caminha. Depois a primeira visita ao veterinário, e aí a pergunta é se ele já tomou vacina: se sim, segue pra rotina, se não, marca a vacina. Lembrar de falar da água sempre limpa.',
  output: {
    title: 'Como cuidar de um gato filhote',
    blocks: [
      {
        type: 'card',
        ref: 'b1',
        title: 'O que comprar',
        description: 'Ração, caixa de areia e uma caminha.',
        tag: 'Etapa 1',
      },
      {
        type: 'card',
        ref: 'b2',
        title: 'Primeira visita ao veterinário',
        description: null,
        tag: 'Etapa 2',
      },
      { type: 'shape', ref: 'b3', shape: 'diamond', text: 'Já tomou vacina?' },
      { type: 'card', ref: 'b4', title: 'Seguir a rotina', description: null, tag: null },
      { type: 'card', ref: 'b5', title: 'Marcar a vacina', description: null, tag: null },
      { type: 'sticky', ref: 'b6', text: 'Falar da água sempre limpa', color: 'yellow' },
    ],
    groups: [{ ref: 'g1', title: 'Antes de o gato chegar', blockRefs: ['b1', 'b2'] }],
    links: [
      { from: 'b1', to: 'b2', label: null },
      { from: 'b2', to: 'b3', label: null },
      { from: 'b3', to: 'b4', label: 'sim' },
      { from: 'b3', to: 'b5', label: 'não' },
    ],
    corrections: [{ from: 'raposa', to: 'gato' }],
  },
};

/** Fluxo: etapas, decisões e anotações ligadas por setas. */
export const flowPrompt: OrganizePrompt<AiFlowOutput> = {
  id: 'flow',
  version: 1,
  example,
  system: `${COMMON_CONTEXT}

<objetivo>
Transforme a fala em um FLUXO para o quadro: blocos, ligações entre eles (setas) e, quando fizer sentido, grupos (molduras). O fluxo mostra como as coisas se encadeiam: etapas, decisões, anotações soltas.
</objetivo>

<como_organizar>
1. Dê ao fluxo um título curto (até 60 caracteres) que diga do que se trata.
2. Separe a fala em ideias e crie um bloco para cada uma. Escolha o tipo pelo papel da ideia:
   - "card": uma etapa ou ideia principal. "title" curto (até 8 palavras); "description" com uma frase só quando a fala trouxer detalhe; "tag" curta e opcional ("Etapa 1", "Cena 2").
   - "shape": um ponto de decisão ou de início e fim. Use "diamond" para pergunta de sim ou não, "ellipse" para início e fim, "rectangle" para o resto.
   - "sticky": lembrete, observação ou ideia solta que não faz parte da sequência. Cor "yellow" para notas em geral, "blue" para informação ou referência, "green" para o que está pronto ou decidido, "pink" para atenção ou problema.
   - "text": um título de seção ("style": "title") ou um parágrafo curto ("style": "body"). Cor "strong" para título, "normal" para corpo, "muted" para apoio.
   - "checklist": uma lista de itens curtos que a pessoa vai marcar. Itens sempre curtos, um por linha de fala.
3. Ligue os blocos na ordem em que as coisas acontecem. Em decisões, use "label" curto nas saídas ("sim", "não"); nas outras ligações, use null. Não ligue um bloco a ele mesmo e não repita a mesma ligação. Notas soltas podem ficar sem ligação.
4. Agrupe em "groups" quando a fala tiver seções naturais (duas ou mais ideias que formam uma parte, como "Antes de gravar"). Cada bloco entra em no máximo um grupo, e um grupo precisa de pelo menos um bloco. Sem seções claras, devolva a lista de grupos vazia. Uma ligação pode apontar para um grupo.
5. Cada bloco e cada grupo tem um "ref" próprio e curto ("b1", "b2", "g1"), que só serve para as ligações e os grupos se referirem a eles.
6. Prefira poucos blocos bem escolhidos: em geral entre 3 e 25, e no máximo 80. Não quebre uma ideia em vários blocos nem repita o que já está em outro.
</como_organizar>

${CORRECTIONS_RULE}

${OUTPUT_RULE}

${renderExample(example.input, example.output)}`,
};
