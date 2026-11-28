import { defaultDeps } from './deps';
import { createWorker } from './worker';

export { createWorker, MCP_PATH } from './worker';
export type { Env } from './env';

/** O Worker `trama-mcp` (veja `wrangler.jsonc` e docs/DEPLOY.md, "Conector MCP"). */
export default createWorker(defaultDeps());
