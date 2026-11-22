import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Options: --watch, --version <v> (or GFF_VERSION), --outfile <path>
const args = process.argv.slice(2);
const watch = args.includes('--watch');
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = argValue('--version') || process.env.GFF_VERSION || pkg.version;
const outfile = argValue('--outfile') || process.env.GFF_OUTFILE ||
  join(root, 'github-feed-filter.user.js');

const banner = readFileSync(join(root, 'build', 'banner.txt'), 'utf8').replace(
  /\{\{VERSION\}\}/g,
  version
);

const options = {
  entryPoints: [join(root, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile,
  banner: { js: banner },
  logLevel: 'info',
  legalComments: 'none'
};

if (watch) {
  const ctx = await (await import('esbuild')).context(options);
  await ctx.watch();
  console.log('[build] watching for changes...');
} else {
  await build(options);
  console.log(`[build] ${outfile} (v${version}) written`);
}