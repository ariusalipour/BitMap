// Durable authored inputs live in application data; generated output lives in cache.
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
  return {
    data: path.resolve(env.BITMAP_DATA_DIR || dataDefault),
    cache: path.resolve(env.BITMAP_CACHE_DIR || cacheDefault),
  };
}

// Resolve existing ancestors too, so a symlink cannot route storage into the source.
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
  const data = await resolvedDestination(directories.data);
  const cache = await resolvedDestination(directories.cache);
  if (contained(cache, data)) {
    throw new Error('Durable BitMap data must be outside the cache directory so clearing cache cannot remove authored inputs.');
  }
  for (const location of [data, cache]) {
    if (contained(canonicalRoot, location)) {
      throw new Error('BitMap storage must be outside the repository. Change BITMAP_DATA_DIR or BITMAP_CACHE_DIR.');
    }
  }
  const directory = path.join(data, 'workspaces', id);
  const out = path.join(cache, 'workspaces', id);
  // Check workspace paths as well: existing workspace folders may themselves be links.
  for (const location of [directory, out, ...['config.json', 'graph.json', 'views.json'].map(name => path.join(directory, name))]) {
    if (contained(canonicalRoot, await resolvedDestination(location))) {
      throw new Error('BitMap workspace storage resolves inside the repository. Choose external storage.');
    }
  }
  const configFile = path.join(directory, 'config.json');
  let previous;
  try { previous = JSON.parse(await fs.readFile(configFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot read workspace configuration: ${error.message}`, { cause: error }); }
  if (previous && previous.root !== canonicalRoot && !(process.platform === 'win32' && previous.root.toLowerCase() === identity)) {
    throw new Error('Workspace identity does not match its repository.');
  }
  if (!graph && !previous) {
    throw new Error('This repository has no saved BitMap graph. Open it with --graph <graph.json> first; BitMap does not automatically analyse source code.');
  }
  const graphFile = path.join(directory, 'graph.json');
  const viewsFile = path.join(directory, 'views.json');
  const graphValue = await readJson(graph ? path.resolve(graph) : graphFile, 'graph JSON');
  const hasViews = Boolean(views || previous?.hasViews);
  const viewsValue = hasViews ? await readJson(views ? path.resolve(views) : viewsFile, 'views JSON') : undefined;
  const workspaceTitle = title || previous?.title || path.basename(canonicalRoot);
  if (typeof workspaceTitle !== 'string' || !workspaceTitle.trim()) throw new Error('The workspace title must be nonempty text.');
  await fs.mkdir(out, { recursive: true });
  // Compilation may reject a structurally invalid graph or an unsafe source path.
  // Keep the previous authored inputs intact until the candidate has passed it.
  if (validate) {
    await validate({ id, root: canonicalRoot, title: workspaceTitle,
      graph: graph ? path.resolve(graph) : graphFile,
      views: hasViews ? (views ? path.resolve(views) : viewsFile) : undefined, out });
  }
  await fs.mkdir(directory, { recursive: true });
  if (graph) await fs.writeFile(graphFile, `${JSON.stringify(graphValue, null, 2)}\n`);
  if (views) await fs.writeFile(viewsFile, `${JSON.stringify(viewsValue, null, 2)}\n`);
  await fs.writeFile(configFile, `${JSON.stringify({ version: 1, root: canonicalRoot, title: workspaceTitle, hasViews }, null, 2)}\n`);
  return { id, root: canonicalRoot, title: workspaceTitle, graph: graphFile, views: hasViews ? viewsFile : undefined, out };
}
