import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const result = spawnSync(process.execPath, [vite, 'build', ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, ANALYZE: '1' },
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
