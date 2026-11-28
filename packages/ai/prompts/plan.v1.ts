import type { AiFlowOutput } from '@trama/core';
import { COMMON_CONTEXT, CORRECTIONS_RULE, OUTPUT_RULE, renderExample } from './shared';
import type { OrganizePrompt } from './shared';

const example: OrganizePrompt<AiFlowOutput>['example'] = {
  input:
    'Preciso preparar a aula de sexta sobre frações. Primeiro separar os exercícios, tem uns vinte, e imprimir. Depois montar os slides, na verdade acho que cinco slides bastam. Decidi usar pizza como exemplo, os alunos adoram. Ah, e confirmar com a coordenação se a sala tem projetor, isso é urgente.',
  output: {
    title: 'Aula de frações na sexta',
    blocks: [
      {
        type: 'card',
        ref: 'b1',
        title: 'Preparar o material',
        description: 'Exercícios e slides da aula.',
        tag: 'Etapa 1',
      },
      {
        type: 'checklist',
        ref: 'b2',
        title: 'Tarefas do material',
        items: ['Separar cerca de 20 exercícios', 'Imprimir os exercícios', 'Montar 5 slides'],
      },
      {
        type: 'sticky',
        ref: 'b3',
        text: 'Decisão: usar pizza como exemplo de fração',
        color: 'green',
      },
      {
        type: 'checklist',
        ref: 'b4',
        title: 'Antes da aula',
        items: ['Confirmar com a coordenação se a sala tem projetor'],
      },
      { type: 'sticky', ref: 'b5', text: 'Urgente: confirmar o projetor', color: 'pink' },
    ],
    groups: [
      { ref: 'g1', title: 'Material', blockRefs: ['b1', 'b2', 'b3'] },
      { ref: 'g2', title: 'Sala', blockRefs: ['b4', 'b5'] },
    ],
    links: [{ from: 'g1', to: 'g2', label: null }],
    corrections: [],
  },
};

/** Plano com tarefas: etapas, decisões e listas de tarefas, em molduras. */
export const planPrompt: OrganizePrompt<AiFlowOutput> = {
  id: 'plan',
  version: 1,
  example,
  system: `${COMMON_CONTEXT}

<objetivo>
Transforme a fala em um PLANO COM TAREFAS para o quadro: o que precisa ser feito, em que ordem, o que já foi decidido e o que preocupa. O plano é organizado em molduras (grupos), cada uma com as suas tarefas.
</objetivo>

<como_organizar>
1. Dê ao plano um título curto (até 60 caracteres).
2. Separe o plano em partes naturais (etapas, fases, áreas) e crie um grupo em "groups" para cada uma, com um "title" curto. Use de 2 a 6 grupos; só use um se a fala for muito curta. Todo bloco de conteúdo deve estar em algum grupo.
3. Dentro de cada grupo:
   - Um "card" para o resumo da etapa, com "tag" curta ("Etapa 1") e uma frase em "description" quando houver detalhe.
   - Um "checklist" com as tarefas, em itens curtos que começam com verbo no infinitivo ("Imprimir os exercícios"). Se a fala trouxer prazo ou responsável, coloque no item ("Imprimir os exercícios, até quinta").
   - "sticky" para decisões já tomadas (cor "green"), pontos de atenção ou prazos urgentes (cor "pink"), referências (cor "blue") e ideias soltas (cor "yellow"). Comece o texto de uma decisão com "Decisão:".
4. Ligue os grupos na ordem do plano (de um grupo para o próximo), com "label" null. Ligue blocos só quando houver dependência clara entre eles.
5. Cada bloco e cada grupo tem um "ref" próprio e curto ("b1", "g1"), que só serve para os grupos e as ligações se referirem a eles. Todo bloco entra em no máximo um grupo.
6. Todas as tarefas ficam desmarcadas. Não crie tarefas que a pessoa não mencionou.
</como_organizar>

${CORRECTIONS_RULE}

${OUTPUT_RULE}

${renderExample(example.input, example.output)}`,
};
