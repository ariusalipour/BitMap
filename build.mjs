// Build the bundled demo, or an explicitly authored architecture snapshot.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureRuntime } from './runtime.mjs';
import { buildSnapshot } from './snapshot.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--root', '--graph', '--title', '--views', '--out'].includes(key) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) {
    throw Error('Usage: node build.mjs [--root directory] [--graph graph.json] [--title name] [--views views.json] [--out directory]');
  }
  options[key.slice(2)] = process.argv[i + 1];
}
const runtime = await ensureRuntime();
const out = path.resolve(options.out || path.join(here, 'dist'));
await mkdir(out, { recursive: true });
const metadata = await buildSnapshot({
  root: options.root || here,
  graph: options.graph || path.join(here, 'examples/bitmap.graph.json'),
  views: options.views,
  title: options.title || (options.root ? undefined : 'BitMap'),
  out, runtime, allowSourceOutput: true,
});
// Retain the standalone export layout for existing build consumers and tests.
for (const name of ['index.html', 'style.css', 'LICENSE', 'LICENSE-GitDiagram', 'THIRD_PARTY_NOTICES.md', 'assets']) {
  await cp(path.join(runtime, name), path.join(out, name), { recursive: true });
}
console.log(JSON.stringify({ ...metadata.validation, title: metadata.title, output: out }, null, 2));
