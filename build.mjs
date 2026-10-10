import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await build({ entryPoints: ['src/index.ts', 'src/app.ts', 'src/lib/origin.ts', 'src/lib/wallet-signature.ts'],
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24',
  outdir: 'dist', outbase: 'src', outExtension: { '.js': '.mjs' }, logLevel: 'info' });
await build({ entryPoints: ['scripts/migrate.ts'], bundle: true, packages: 'external',
  platform: 'node', format: 'esm', target: 'node24', outfile: 'dist/migrate.mjs', logLevel: 'info' });
