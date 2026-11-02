import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { prepareWorkspace, workspaceDirectories } from './workspaces.mjs';

test('repository graphs are portable, validated before replacement, and cached externally', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bitmap-workspaces-'));
  const before = { BITMAP_DATA_DIR: process.env.BITMAP_DATA_DIR, BITMAP_CACHE_DIR: process.env.BITMAP_CACHE_DIR };
  process.env.BITMAP_DATA_DIR = path.join(temporary, 'data');
  process.env.BITMAP_CACHE_DIR = path.join(temporary, 'cache');
  const json = async (file, value) => fs.writeFile(file, JSON.stringify(value));
  const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
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
    await json(graph, graphValue);
    await json(views, viewsValue);
    const first = await prepareWorkspace({ root: firstRoot, graph, views, title: 'Portable example' });
    assert.equal(first.graph, path.join(await fs.realpath(firstRoot), 'bitmap', 'graph.json'));
    assert.equal(first.out, path.join(await fs.realpath(process.env.BITMAP_CACHE_DIR), 'workspaces', first.id));
    const configFile = path.join(firstRoot, 'bitmap', 'config.json');
    assert.deepEqual(await read(configFile), { version: 1, title: 'Portable example', hasViews: true });
    await fs.cp(path.join(firstRoot, 'bitmap'), path.join(secondRoot, 'bitmap'), { recursive: true });
    const second = await prepareWorkspace({ root: secondRoot });
    assert.notEqual(first.id, second.id, 'same basename uses separate generated cache');
    assert.equal(second.title, first.title);
    assert.deepEqual(await read(second.graph), graphValue);
    assert.deepEqual(await read(second.views), viewsValue);
    await fs.unlink(graph);
    await fs.unlink(views);
    const oldTime = new Date('2020-01-01T00:00:00Z');
    for (const file of [first.graph, first.views, configFile]) await fs.utimes(file, oldTime, oldTime);
    assert.deepEqual(await prepareWorkspace({ root: firstRoot }), first);
    for (const file of [first.graph, first.views, configFile]) assert.equal((await fs.stat(file)).mtimeMs, oldTime.getTime(), 'unchanged reopen does not rewrite authored files');
    const invalid = path.join(temporary, 'invalid.json');
    await json(invalid, { nodes: [] });
    await assert.rejects(prepareWorkspace({ root: firstRoot, graph: invalid, title: 'Rejected', validate: async () => { throw new Error('Graph validation failed'); } }), /Graph validation failed/);
    assert.deepEqual(await read(first.graph), graphValue);
    assert.deepEqual(await read(first.views), viewsValue);
    assert.deepEqual(await read(configFile), { version: 1, title: 'Portable example', hasViews: true });
    assert.equal(await fs.readFile(path.join(firstRoot, 'app.js'), 'utf8'), 'export const app = 1;\n');
    const fresh = path.join(temporary, 'fresh');
    await fs.mkdir(fresh);
    await assert.rejects(prepareWorkspace({ root: fresh }), /bitmap\/graph.json.*--graph.*does not automatically analyse/);
    await fs.mkdir(path.join(fresh, 'bitmap'));
    await json(path.join(fresh, 'bitmap', 'graph.json'), graphValue);
    await json(path.join(fresh, 'bitmap', 'views.json'), viewsValue);
    const discovered = await prepareWorkspace({ root: fresh });
    assert.equal(discovered.title, 'fresh');
    assert.ok(discovered.views, 'views are discovered without configuration');
    process.env.BITMAP_CACHE_DIR = path.join(firstRoot, 'generated');
    await assert.rejects(prepareWorkspace({ root: firstRoot }), /cache must be outside the repository/);
    process.env.BITMAP_CACHE_DIR = path.join(temporary, 'cache');
    const linkRoot = path.join(temporary, 'linked');
    await fs.mkdir(linkRoot);
    await fs.symlink(path.join(firstRoot, 'bitmap'), path.join(linkRoot, 'bitmap'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(prepareWorkspace({ root: linkRoot, graph: first.graph }), /must not use symbolic links/);
    // Directory links need no special Windows privilege; the same lstat guard
    // protects individual files. Test those wherever file symlinks are allowed.
    const linkedFile = path.join(secondRoot, 'bitmap', 'graph.json');
    await fs.unlink(linkedFile);
    try {
      await fs.symlink(first.graph, linkedFile, 'file');
      await assert.rejects(prepareWorkspace({ root: secondRoot }), /must not use symbolic links/);
    } catch (error) { if (error.code !== 'EPERM') throw error; }
    const cacheLink = path.join(temporary, 'cache-link');
    await fs.symlink(firstRoot, cacheLink, process.platform === 'win32' ? 'junction' : 'dir');
    process.env.BITMAP_CACHE_DIR = cacheLink;
    await assert.rejects(prepareWorkspace({ root: firstRoot }), /cache must be outside the repository/);
    process.env.BITMAP_CACHE_DIR = path.join(temporary, 'cache');
    const legacyRoot = path.join(temporary, 'legacy-source');
    await fs.mkdir(legacyRoot);
    const canonical = await fs.realpath(legacyRoot);
    const identity = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    const id = createHash('sha256').update(identity).digest('hex');
    const legacy = path.join(process.env.BITMAP_DATA_DIR, 'workspaces', id);
    await fs.mkdir(legacy, { recursive: true });
    await json(path.join(legacy, 'graph.json'), graphValue);
    await json(path.join(legacy, 'views.json'), viewsValue);
    await json(path.join(legacy, 'config.json'), { version: 1, root: canonical, title: 'Legacy', hasViews: true });
    await fs.writeFile(path.join(legacy, 'config.json'), '{broken');
    const explicit = await prepareWorkspace({ root: legacyRoot, graph: first.graph });
    assert.equal(explicit.title, 'legacy-source', 'explicit import ignores obsolete legacy settings');
    assert.equal(explicit.views, undefined);
    for (const name of ['graph.json', 'config.json']) await fs.unlink(path.join(legacyRoot, 'bitmap', name));
    await json(path.join(legacy, 'config.json'), { version: 1, root: canonical, title: 'Legacy', hasViews: true });
    const migrated = await prepareWorkspace({ root: legacyRoot });
    assert.deepEqual(await read(migrated.graph), graphValue);
    assert.deepEqual(await read(migrated.views), viewsValue);
    assert.equal(migrated.title, 'Legacy');
    assert.deepEqual(await read(path.join(legacy, 'graph.json')), graphValue, 'legacy backup survives migration');
    await json(migrated.graph, { nodes: [{ id: 'local' }], edges: [] });
    await json(path.join(legacy, 'graph.json'), { nodes: [{ id: 'outdated' }], edges: [] });
    assert.deepEqual(await read((await prepareWorkspace({ root: legacyRoot })).graph), { nodes: [{ id: 'local' }], edges: [] }, 'local graph takes precedence');
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    assert.ok(path.basename(temporary).startsWith('bitmap-workspaces-'));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('platform directories retain legacy data location and separate generated caches', () => {
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
