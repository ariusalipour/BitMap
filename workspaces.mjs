// Authored inputs travel with the repository; generated output lives in external cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export function workspaceDirectories(env = process.env, platform = process.platform, home = os.homedir()) {
  const dataDefault = platform === 'win32'
    ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'BitMap')
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'BitMap')
      : path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'bitmap');
  const cacheDefault = platform === 'win32'
    ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'BitMap', 'Cache')
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Caches', 'BitMap')
      : path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'bitmap');
  return { data: path.resolve(env.BITMAP_DATA_DIR || dataDefault), cache: path.resolve(env.BITMAP_CACHE_DIR || cacheDefault) };
}

async function resolvedDestination(destination) {
  let cursor = path.resolve(destination);
  const tail = [];
  while (true) {
    try { return path.join(await fs.realpath(cursor), ...tail); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      tail.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function rejectLink(file, directory = false) {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw new Error(`BitMap repository storage must not use symbolic links: ${file}`);
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`Invalid BitMap ${directory ? 'directory' : 'file'}: ${file}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function readJson(file, label) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { throw new Error(`Cannot read ${label} at ${file}: ${error.message}`, { cause: error }); }
}

export async function prepareWorkspace({ root, graph, views, title, validate } = {}) {
  if (!root) throw new Error('A repository directory is required.');
  const canonicalRoot = await fs.realpath(path.resolve(root));
  if (!(await fs.stat(canonicalRoot)).isDirectory()) throw new Error('The repository path must be a directory.');
  const identity = process.platform === 'win32' ? canonicalRoot.toLowerCase() : canonicalRoot;
  const id = createHash('sha256').update(identity).digest('hex');
  const directories = workspaceDirectories();
  const cache = await resolvedDestination(directories.cache);
  const out = path.join(cache, 'workspaces', id);
  if (contained(canonicalRoot, cache) || contained(canonicalRoot, await resolvedDestination(out))) {
    throw new Error('BitMap generated cache must be outside the repository. Change BITMAP_CACHE_DIR.');
  }
  const directory = path.join(canonicalRoot, 'bitmap');
  const configFile = path.join(directory, 'config.json');
  const graphFile = path.join(directory, 'graph.json');
  const viewsFile = path.join(directory, 'views.json');
  await rejectLink(directory, true);
  for (const file of [configFile, graphFile, viewsFile]) await rejectLink(file);
  const localGraph = await exists(graphFile);
  let previous = await exists(configFile) ? await readJson(configFile, 'workspace configuration') : undefined;
  // Earlier versions kept authored inputs in app data. Import only when no local
  // graph exists, and leave the legacy directory intact as a migration backup.
  const legacyDirectory = path.join(directories.data, 'workspaces', id);
  let legacy = false;
  if (!graph && !localGraph && await exists(path.join(legacyDirectory, 'graph.json'))) {
    const legacyConfigFile = path.join(legacyDirectory, 'config.json');
    const legacyConfig = await exists(legacyConfigFile) ? await readJson(legacyConfigFile, 'legacy workspace configuration') : undefined;
    if (legacyConfig?.root && (process.platform === 'win32' ? legacyConfig.root.toLowerCase() : legacyConfig.root) !== identity) {
      throw new Error('Legacy workspace identity does not match its repository.');
    }
    previous ??= legacyConfig;
    legacy = true;
  }
  if (!graph && !localGraph && !legacy) {
    throw new Error('This repository has no bitmap/graph.json. Open it with --graph <graph.json> first; BitMap does not automatically analyse source code.');
  }
  const graphInput = graph ? path.resolve(graph) : localGraph ? graphFile : path.join(legacyDirectory, 'graph.json');
  const viewsInput = views ? path.resolve(views) : await exists(viewsFile) ? viewsFile
    : legacy && previous?.hasViews ? path.join(legacyDirectory, 'views.json') : undefined;
  const graphValue = await readJson(graphInput, 'graph JSON');
  const viewsValue = viewsInput ? await readJson(viewsInput, 'views JSON') : undefined;
  const workspaceTitle = title || previous?.title || path.basename(canonicalRoot);
  if (typeof workspaceTitle !== 'string' || !workspaceTitle.trim()) throw new Error('The workspace title must be nonempty text.');
  await fs.mkdir(out, { recursive: true });
  // Validation completes before authored inputs or portable settings are replaced.
  if (validate) await validate({ id, root: canonicalRoot, title: workspaceTitle, graph: graphInput, views: viewsInput, out });
  await fs.mkdir(directory, { recursive: true });
  if (graphInput !== graphFile) await fs.writeFile(graphFile, `${JSON.stringify(graphValue, null, 2)}\n`);
  if (viewsInput && viewsInput !== viewsFile) await fs.writeFile(viewsFile, `${JSON.stringify(viewsValue, null, 2)}\n`);
  const portableConfig = `${JSON.stringify({ version: 1, title: workspaceTitle, hasViews: Boolean(viewsInput) }, null, 2)}\n`;
  if (!await exists(configFile) || await fs.readFile(configFile, 'utf8') !== portableConfig) await fs.writeFile(configFile, portableConfig);
  return { id, root: canonicalRoot, title: workspaceTitle, graph: graphFile, views: viewsInput ? viewsFile : undefined, out };
}
