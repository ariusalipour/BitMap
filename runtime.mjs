// Build the shared compiler and browser assets only when their inputs change.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const upstream = path.join(here, 'vendor/gitdiagram');
const publicFiles = ['index.html', 'style.css', 'LICENSE', 'LICENSE-GitDiagram', 'THIRD_PARTY_NOTICES.md'];
const resolver = {
  name: 'vendored-gitdiagram-aliases',
  setup(b) {
    b.onResolve({ filter: /^~\// }, args => ({ path: path.join(upstream, 'src', args.path.slice(2) + '.ts') }));
  },
};

async function fingerprint() {
  const files = [...publicFiles, 'package-lock.json', 'runtime.mjs'];
  for (const entry of await readdir(here)) if (entry.endsWith('.ts')) files.push(entry);
  async function visit(directory) {
    for (const entry of await readdir(path.join(here, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(relative);
      else files.push(relative);
    }
  }
  await visit('vendor/gitdiagram');
  const hash = createHash('sha256');
  hash.update('bitmap-runtime-v1\0' + process.version + '\0');
  for (const relative of files.sort()) {
    hash.update(relative.replaceAll('\\', '/') + '\0');
    hash.update(await readFile(path.join(here, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Return one shared runtime directory; unchanged inputs retain existing assets. */
export async function ensureRuntime() {
  const directory = path.join(here, 'dist', 'runtime');
  const digest = await fingerprint();
  const manifestPath = path.join(directory, 'runtime-manifest.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.fingerprint === digest && Array.isArray(manifest.files)) {
      await Promise.all(manifest.files.map(file => stat(path.join(directory, file))));
      return directory;
    }
  } catch { /* Missing or interrupted build: rebuild the shared runtime. */ }
  await mkdir(directory, { recursive: true });
  await build({
    entryPoints: [path.join(upstream, 'src/server/generate/graph.ts')],
    outfile: path.join(directory, 'compiler.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [resolver],
  });
  for (const name of publicFiles) await cp(path.join(here, name), path.join(directory, name));
  await build({
    entryPoints: [path.join(here, 'theme-bootstrap.ts')], outfile: path.join(directory, 'assets/theme-bootstrap.js'),
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
  });
  const result = await build({
    entryPoints: [path.join(here, 'viewer.ts')], outdir: path.join(directory, 'assets'),
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
    plugins: [resolver], minify: true, legalComments: 'linked', metafile: true,
  });
  const files = [...publicFiles, 'compiler.mjs', 'assets/theme-bootstrap.js',
    ...Object.keys(result.metafile.outputs).map(file => path.relative(directory, path.resolve(file)))];
  await writeFile(manifestPath, JSON.stringify({ fingerprint: digest, files: [...new Set(files)] }, null, 2));
  return directory;
}
