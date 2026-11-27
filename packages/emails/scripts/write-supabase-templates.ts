// Gera os modelos de e-mail do Supabase Auth em supabase/templates/.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SUPABASE_TEMPLATES } from '../src/supabase-templates';

const outDir = fileURLToPath(new URL('../../../supabase/templates/', import.meta.url));
await mkdir(outDir, { recursive: true });

for (const [name, build] of Object.entries(SUPABASE_TEMPLATES)) {
  await writeFile(outDir + name, await build());
  console.log(`supabase/templates/${name}`);
}
