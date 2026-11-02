// Verify shared compilation and source-isolated snapshot generation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureRuntime } from './runtime.mjs';
import { buildSnapshot } from './snapshot.mjs';

test('unchanged tool inputs reuse the shared compiler and viewer', async () => {
  const runtime = await ensureRuntime();
  const files = ['compiler.mjs', 'assets/viewer.js'];
  const before = await Promise.all(files.map(async file => (await stat(path.join(runtime, file))).mtimeMs));
  assert.equal(await ensureRuntime(), runtime);
  const after = await Promise.all(files.map(async file => (await stat(path.join(runtime, file))).mtimeMs));
  assert.deepEqual(after, before);
});

test('snapshots contain only map data, refresh source hashes, and leave source untouched', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'bitmap-snapshot-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'source');
  const out = path.join(temporary, 'cache');
  await mkdir(root);
  await writeFile(path.join(root, 'sample.ts'), 'export const value = 1;');
  const graphPath = path.join(temporary, 'graph.json');
  await writeFile(graphPath, JSON.stringify({
    groups: [{ id: 'application', label: 'Application', description: null }],
    nodes: [{ id: 'sample', label: 'Sample', type: 'Module', path: 'sample.ts', description: null, groupId: 'application', shape: 'box' }],
    edges: [],
  }));
  const runtime = await ensureRuntime();
  const options = { root, out, graph: graphPath, runtime };
  const first = await buildSnapshot(options);
  assert.deepEqual((await readdir(out)).sort(), ['all.mmd', 'architecture.mmd', 'diagram.json', 'overview.mmd']);
  assert.deepEqual(await readdir(root), ['sample.ts']);
  assert.equal(await readFile(path.join(root, 'sample.ts'), 'utf8'), 'export const value = 1;');
  await writeFile(path.join(root, 'sample.ts'), 'export const value = 2;');
  const second = await buildSnapshot(options);
  assert.notEqual(first.reviewedFileHashes['sample.ts'], second.reviewedFileHashes['sample.ts']);
  await assert.rejects(buildSnapshot({ ...options, out: path.join(root, '.bitmap') }), /outside the source repository/);
  assert.deepEqual(await readdir(root), ['sample.ts']);
});
