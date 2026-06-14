// Post-build step: inline the built JS + CSS into a single self-contained
// preview.html so it renders inside the workspace's sandboxed iframe
// (no external network / asset loading required).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, '..', 'dist');

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8');
const assetsDir = path.join(dist, 'assets');
const files = fs.readdirSync(assetsDir);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));

let js = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');
const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8');

// Escape any "</script" sequence so the inline <script> block can't be
// terminated early by the HTML parser.
js = js.replace(/<\/script/gi, '<\\/script');

let out = html
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/, () => `<script type="module">\n${js}\n</script>`)
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`);

const target = path.join(root, '..', '..', 'shadow-macro-preview.html');
fs.writeFileSync(target, out, 'utf-8');
console.log('Wrote single-file preview:', target);
