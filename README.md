# Trama

Quadro visual para montar fluxos de vídeo, aulas, planos e roteiros, salvar no Google Drive e
transformar ideias faladas em fluxos organizados com IA.

- Plano do produto e da construção: [`docs/PLAN.md`](docs/PLAN.md)
- Telas de referência: [`docs/telas/`](docs/telas/)
- Regras para quem programa (pessoas e agentes): [`AGENTS.md`](AGENTS.md)
- Decisões tomadas: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Começar

Precisa de Node 24 e pnpm 12.

```bash
npm install -g pnpm@12
```

```bash
pnpm install
```

```bash
pnpm dev
```

O site abre em http://localhost:5173. Para rodar os testes:

```bash
pnpm test
```

Os outros comandos estão no [`AGENTS.md`](AGENTS.md#comandos).
