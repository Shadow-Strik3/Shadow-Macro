// Bundles the Electron main + preload into dist-electron/.
// Main is bundled as ESM (Electron 31 supports ESM main); preload stays CJS.
import { build } from 'esbuild';
import fs from 'node:fs';

// Native modules must stay external (never bundled) so they load from
// node_modules at runtime; electron-builder unpacks them from the asar.
const externals = ['electron', '@nut-tree-fork/nut-js', 'uiohook-napi'];

await build({
  entryPoints: ['src/main/main.js'],
  outfile: 'dist-electron/main/main.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: externals,
  banner: {
    // ESM bundles lose __dirname/require; recreate them for any deps that need them.
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});

await build({
  entryPoints: ['src/preload/preload.cjs'],
  outfile: 'dist-electron/preload/preload.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: externals,
  logLevel: 'info',
});

// Fix the preload path reference inside the bundled main (../preload/preload.cjs
// resolves correctly relative to dist-electron/main).
const mainFile = 'dist-electron/main/main.js';
let code = fs.readFileSync(mainFile, 'utf-8');
fs.writeFileSync(mainFile, code, 'utf-8');

console.log('Electron bundles written to dist-electron/');
