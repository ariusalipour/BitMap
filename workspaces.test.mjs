import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareWorkspace, workspaceDirectories } from './workspaces.mjs';

test('external workspaces preserve inputs without modifying repositories', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bitmap-workspaces-'));
  const before = { data: process.env.BITMAP_DATA_DIR, cache: process.env.BITMAP_CACHE_DIR };
  process.env.BITMAP_DATA_DIR = path.join(temporary, 'data');
  process.env.BITMAP_CACHE_DIR = path.join(temporary, 'cache');
  try {
    const firstRoot = path.join(temporary, 'one', 'source');
    const secondRoot = path.join(temporary, 'two', 'source');
    await fs.mkdir(firstRoot, { recursive: true });
    await fs.mkdir(secondRoot, { recursive: true });
    await fs.writeFile(path.join(firstRoot, 'app.js'), 'export const app = 1;\n');
    const graph = path.join(temporary, 'authored.json');
    const views = path.join(temporary, 'views.json');
    const graphValue = { nodes: [{ id: 'app', label: 'Application' }], edges: [] };
    const viewsValue = [{ id: 'overview', label: 'Overview', nodeIds: ['app'] }];
    await fs.writeFile(graph, JSON.stringify(graphValue));
    await fs.writeFile(views, JSON.stringify(viewsValue));
    const first = await prepareWorkspace({ root: firstRoot, graph, views, title: 'First' });
    const second = await prepareWorkspace({ root: secondRoot, graph });
    assert.notEqual(first.id, second.id, 'same basename does not collide');
    assert.equal(first.id.length, 64);
    assert.ok(first.graph.startsWith(process.env.BITMAP_DATA_DIR));
    assert.ok(first.out.startsWith(process.env.BITMAP_CACHE_DIR));
    await fs.unlink(graph);
    await fs.unlink(views);
    const reopened = await prepareWorkspace({ root: path.join(firstRoot, '.') });
    assert.deepEqual(reopened, first);
    assert.deepEqual(JSON.parse(await fs.readFile(reopened.graph, 'utf8')), graphValue);
    assert.deepEqual(JSON.parse(await fs.readFile(reopened.views, 'utf8')), viewsValue);
    const invalidGraph = path.join(temporary, 'invalid.json');
    await fs.writeFile(invalidGraph, JSON.stringify({ nodes: [] }));
    const configFile = path.join(path.dirname(first.graph), 'config.json');
    const originalConfig = await fs.readFile(configFile, 'utf8');
    await assert.rejects(prepareWorkspace({ root: firstRoot, graph: invalidGraph, title: 'Rejected title',
      validate: async candidate => {
        assert.equal(candidate.graph, invalidGraph);
        throw new Error('Graph validation failed');
      } }), /Graph validation failed/);
    assert.deepEqual(JSON.parse(await fs.readFile(first.graph, 'utf8')), graphValue,
      'failed compilation does not replace the durable graph');
    assert.equal(await fs.readFile(configFile, 'utf8'), originalConfig);
    assert.deepEqual(await fs.readdir(firstRoot), ['app.js']);
    assert.equal(await fs.readFile(path.join(firstRoot, 'app.js'), 'utf8'), 'export const app = 1;\n');
    assert.deepEqual(await fs.readdir(secondRoot), []);
    const fresh = path.join(temporary, 'fresh');
    await fs.mkdir(fresh);
    await assert.rejects(prepareWorkspace({ root: fresh }), /--graph.*does not automatically analyse/);
    process.env.BITMAP_DATA_DIR = path.join(firstRoot, '.bitmap');
    await assert.rejects(prepareWorkspace({ root: firstRoot }), /outside the repository/);
    assert.deepEqual(await fs.readdir(firstRoot), ['app.js']);
    const storageLink = path.join(temporary, 'linked-storage');
    await fs.symlink(firstRoot, storageLink, process.platform === 'win32' ? 'junction' : 'dir');
    process.env.BITMAP_DATA_DIR = storageLink;
    process.env.BITMAP_CACHE_DIR = path.join(temporary, 'cache');
    await assert.rejects(prepareWorkspace({ root: firstRoot }), /outside the repository/);
    assert.deepEqual(await fs.readdir(firstRoot), ['app.js']);
    process.env.BITMAP_DATA_DIR = path.join(temporary, 'data');
    process.env.BITMAP_CACHE_DIR = firstRoot;
    await assert.rejects(prepareWorkspace({ root: firstRoot }), /outside the repository/);
    assert.deepEqual(await fs.readdir(firstRoot), ['app.js']);
    process.env.BITMAP_CACHE_DIR = path.join(temporary, 'cache');
    process.env.BITMAP_DATA_DIR = path.join(temporary, 'cache', 'data');
    await assert.rejects(prepareWorkspace({ root: firstRoot }), /outside the cache directory/);
  } finally {
    for (const [name, value] of [['BITMAP_DATA_DIR', before.data], ['BITMAP_CACHE_DIR', before.cache]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    // mkdtemp supplies this exact dedicated directory; never delete an inferred repository path.
    assert.ok(path.basename(temporary).startsWith('bitmap-workspaces-'));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('platform directories keep durable data separate from generated caches', () => {
  assert.deepEqual(workspaceDirectories({ BITMAP_DATA_DIR: '/custom-data', BITMAP_CACHE_DIR: '/custom-cache' }, 'linux', '/home/test'), {
    data: path.resolve('/custom-data'), cache: path.resolve('/custom-cache'),
  });
  const linux = workspaceDirectories({ XDG_DATA_HOME: '/data', XDG_CACHE_HOME: '/cache' }, 'linux', '/home/test');
  assert.equal(linux.data, path.resolve('/data', 'bitmap'));
  assert.equal(linux.cache, path.resolve('/cache', 'bitmap'));
  const windows = workspaceDirectories({ LOCALAPPDATA: 'C:/AppData' }, 'win32', 'C:/Users/test');
  assert.equal(windows.data, path.resolve('C:/AppData', 'BitMap'));
  assert.equal(windows.cache, path.resolve('C:/AppData', 'BitMap', 'Cache'));
});
