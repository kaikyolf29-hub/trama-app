import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server';

/** Liga um cliente MCP de verdade (o SDK) a um servidor, em memória. */
export async function connectInMemory(server: McpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'cliente-de-teste', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

type CallResult = Awaited<ReturnType<Client['callTool']>>;

/** O texto da resposta de uma ferramenta (é o JSON da saída, ou a frase de erro). */
export function textOf(result: CallResult): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((item) => item.text ?? '').join('\n');
}

export function structuredOf<T = Record<string, unknown>>(result: CallResult): T {
  return (result as { structuredContent: T }).structuredContent;
}

export function isError(result: CallResult): boolean {
  return (result as { isError?: boolean }).isError === true;
}
