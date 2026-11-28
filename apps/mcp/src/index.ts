import { defaultDeps } from './deps';
import { createWorker } from './worker';

export type { Env } from './env';

// Só o `default` pode sair daqui: o workerd trata todo `export` nomeado como uma entrada do Worker.

/** O Worker `trama-mcp` (veja `wrangler.jsonc` e docs/DEPLOY.md, "Conector MCP"). */
export default createWorker(defaultDeps());
