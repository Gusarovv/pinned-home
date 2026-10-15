import { cpSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
rmSync('dist', { recursive: true, force: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/background.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome126',
  outfile: 'dist/background.js',
  logLevel: 'info',
});
cpSync('manifest.json', 'dist/manifest.json');
for (const icon of readdirSync('assets')) cpSync(`assets/${icon}`, `dist/${icon}`);
