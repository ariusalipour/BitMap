// Compile authored graph data without installing or writing into the source repository.
import { readFile, writeFile, mkdir, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export async function buildSnapshot({ root, graph: graphPath, views: viewsPath, title, out, runtime, allowSourceOutput = false }) {
  root = await realpath(path.resolve(root));
  out = path.resolve(out);
  let ancestor = out;
  const missing = [];
  while (true) {
    try { ancestor = await realpath(ancestor); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.unshift(path.basename(ancestor));
      ancestor = parent;
    }
  }
  const outputPath = path.join(ancestor, ...missing);
  const relativeOutput = path.relative(root, outputPath);
  if (!allowSourceOutput && (!relativeOutput || (!relativeOutput.startsWith('..' + path.sep) && relativeOutput !== '..' && !path.isAbsolute(relativeOutput)))) {
    throw Error('Snapshot output must be outside the source repository');
  }
  title ||= path.basename(root);
  await mkdir(out, { recursive: true });
  const compilerPath = path.join(runtime, 'compiler.mjs');
  const compilerVersion = createHash('sha256').update(await readFile(compilerPath)).digest('hex');
  const compiler = await import(pathToFileURL(compilerPath).href + '?v=' + compilerVersion);
  const parsed = compiler.parseDiagramGraph(await readFile(graphPath, 'utf8'));
  if (!parsed.graph) throw Error(JSON.stringify(parsed.issues));
  const graph = parsed.graph;
  const paths = new Set(graph.nodes.map(n => n.path).concat(graph.edges.map(e => e.evidencePath)).filter(Boolean));
  const lookup = new Set();
  const pathTypes = new Map();
  const reviewedFileHashes = {};
  for (const relative of paths) {
    // Require portable checkout-relative paths; also check real paths for symlinks.
    if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => p === '..' || p === '.')) {
      throw Error('Expected a checkout-relative path: ' + relative);
    }
    const resolved = await realpath(path.resolve(root, relative));
    const inside = path.relative(root, resolved);
    if (!inside || inside.startsWith('..' + path.sep) || inside === '..' || path.isAbsolute(inside)) throw Error('Path escapes checkout: ' + relative);
    const info = await stat(resolved);
    lookup.add(relative);
    pathTypes.set(relative, info.isDirectory() ? 'tree' : 'blob');
    if (info.isFile()) reviewedFileHashes[relative] = createHash('sha256').update(await readFile(resolved)).digest('hex');
  }
  const validation = compiler.validateDiagramGraph(graph, lookup);
  if (!validation.valid) throw Error(JSON.stringify(validation.issues));
  function git(args, fallback) {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim(); }
    catch { return fallback; }
  }
  const sourceCommit = git(['rev-parse', 'HEAD'], 'uncommitted');
  const branch = git(['branch', '--show-current'], 'main') || 'main';
  const workingTreeStatus = git(['status', '--porcelain'], 'unversioned');
  const compile = graph => compiler.compileDiagramGraph({ graph, username: 'local', repo: 'source', branch, pathTypes })
    .split('\n').filter(line => !/^\s*click\s/.test(line)).join('\n');
  const allIds = graph.nodes.map(n => n.id);
  const definitions = viewsPath ? JSON.parse(await readFile(path.resolve(viewsPath), 'utf8'))
    : [{ id: 'overview', label: 'Architecture overview', nodeIds: allIds }];
  if (!Array.isArray(definitions)) throw Error('Views must be an array');
  const seen = new Set(['all']);
  for (const view of definitions) {
    if (!view || typeof view.id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(view.id) || seen.has(view.id)
      || typeof view.label !== 'string' || !view.label.trim() || !Array.isArray(view.nodeIds) || !view.nodeIds.length
      || view.nodeIds.some(id => !allIds.includes(id))) throw Error('Invalid view definition: ' + JSON.stringify(view));
    seen.add(view.id);
  }
  definitions.push({ id: 'all', label: 'All components', nodeIds: allIds });
  const views = definitions.map(({ id, label, nodeIds }) => {
    const ids = new Set(nodeIds);
    const nodes = graph.nodes.filter(n => ids.has(n.id));
    const groupIds = new Set(nodes.map(n => n.groupId));
    const subset = { nodes, groups: graph.groups.filter(g => groupIds.has(g.id)), edges: graph.edges.filter(e => ids.has(e.from) && ids.has(e.to)) };
    const check = compiler.validateDiagramGraph(subset, lookup);
    if (!check.valid) throw Error(JSON.stringify(check.issues));
    return { id, label, graph: subset, mermaid: compile(subset) };
  });
  const metadata = {
    title, root, graph, mermaid: compile(graph), views,
    builtAt: new Date().toISOString(), sourceCommit,
    upstreamCommit: '7876ab0ca8b5ee46e836235e23c4886d5cdb79ae',
    workingTreeDirty: Boolean(workingTreeStatus), workingTreeStatus, reviewedFileHashes,
    provenance: 'An explicitly authored architecture snapshot. Paths validated and graph compiled locally with GitDiagram-derived code. No automatic source analysis or hosted generation.',
    validation: { valid: true, checkedPaths: paths.size, nodes: graph.nodes.length, edges: graph.edges.length },
  };
  await writeFile(path.join(out, 'diagram.json'), JSON.stringify(metadata, null, 2));
  await writeFile(path.join(out, 'architecture.mmd'), metadata.mermaid);
  for (const view of views) await writeFile(path.join(out, view.id + '.mmd'), view.mermaid);
  return metadata;
}
