// Read-only loopback server. Only graph-linked source files are accessible.
import http from 'node:http';
import { readFile, realpath, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBranch, listBranches } from './branch-comparison.mjs';
import { buildSemanticView } from './semantic-views.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mmd': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
function within(base, target) {
  const relative = path.relative(base, target);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
export async function createAppServer(outputDirectory = path.join(here, 'dist'), runtimeDirectory = outputDirectory) {
  const out = await realpath(outputDirectory);
  const runtime = await realpath(runtimeDirectory);
  const data = JSON.parse(await readFile(path.join(out, 'diagram.json'), 'utf8'));
  const root = await realpath(data.root);
  let semantic;
  try { semantic = JSON.parse(await readFile(path.join(out,'semantic.json'),'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw Error('Cannot read the generated semantic index: '+error.message); }
  const allowed = new Set(data.graph.nodes.map(n => n.path).concat(data.graph.edges.map(e => e.evidencePath)).filter(Boolean));
  for (const file of semantic?.files ?? []) allowed.add(file.path);
  const tool = {
    name: 'get_repository_diagram', description: 'Read the locally configured architecture snapshot. No remote lookup or generation.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: { repository: { type: 'string', description: 'The configured map title or local checkout path; omit to read the current map.' } } },
  };
  async function mcp(req, res, host) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.writeHead(405); res.end(); return; }
    if (req.headers.origin && req.headers.origin !== 'http://' + host) { res.writeHead(403); res.end(); return; }
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 65536) { res.writeHead(413); res.end(); return; } }
    let call;
    try { call = JSON.parse(raw); } catch { res.writeHead(400); res.end('Invalid JSON'); return; }
    if (!call || typeof call !== 'object' || Array.isArray(call)) { res.writeHead(400); res.end('Invalid request'); return; }
    if (call.id === undefined) { res.writeHead(202); res.end(); return; }
    let result;
    if (call.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'bitmap', version: '0.1.0' } };
    else if (call.method === 'ping') result = {};
    else if (call.method === 'tools/list') result = { tools: [tool] };
    else if (call.method === 'tools/call' && call.params?.name === tool.name) {
      const requested = call.params.arguments?.repository;
      const valid = !requested || [data.title, data.root].includes(requested);
      result = valid ? { content: [{ type: 'text', text: JSON.stringify({ ...data, localViewerUrl: 'http://' + host }) }], structuredContent: { ...data, localViewerUrl: 'http://' + host } }
        : { isError: true, content: [{ type: 'text', text: 'Only the configured local repository map is available. No remote lookup was performed.' }] };
    } else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, error: { code: -32601, message: 'Method not found' } })); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
  }
  const server = http.createServer(async (req, res) => {
    const host = `127.0.0.1:${server.address().port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    if (req.headers.host !== host) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      const url = new URL(req.url, 'http://' + host);
      if (url.pathname === '/mcp') { await mcp(req, res, host); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); res.end('Forbidden'); return; }
      if (url.pathname === '/semantic' || url.pathname === '/semantic/view') {
        if (req.headers.origin && req.headers.origin !== 'http://'+host) { res.writeHead(403); res.end('Forbidden'); return; }
        res.setHeader('Content-Type','application/json');
        if (!semantic) { res.end(JSON.stringify({available:false,message:'Reopen this repository with bitmap open to generate a source index.'})); return; }
        if (url.pathname === '/semantic') { res.end(req.method === 'HEAD' ? undefined : JSON.stringify({...semantic,available:true})); return; }
        const mode = url.searchParams.get('mode') ?? 'children';
        const focus = url.searchParams.get('focus') || undefined;
        const offset = Number(url.searchParams.get('offset') ?? 0);
        if (!['children','calls','dependencies'].includes(mode) || !Number.isSafeInteger(offset) || offset < 0 || (focus && !semantic.symbols.some(symbol=>symbol.id===focus))) {
          res.writeHead(400); res.end(JSON.stringify({message:'Choose an indexed symbol and a supported view mode.'})); return;
        }
        const view = buildSemanticView(semantic,{focus,mode,offset});
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(view)); return;
      }
      if (url.pathname === '/comparison' || url.pathname === '/branches') {
        if (req.headers.origin && req.headers.origin !== 'http://' + host) { res.writeHead(403); res.end('Forbidden'); return; }
        res.setHeader('Content-Type', 'application/json');
        if (url.pathname === '/branches') {
          const branches = await listBranches(root);
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify(branches)); return;
        }
        const bases = url.searchParams.getAll('base');
        const scope = url.searchParams.get('scope') ?? 'architecture';
        if (!['architecture','semantic'].includes(scope) || (scope === 'semantic' && !semantic)) {
          res.writeHead(400); res.end(JSON.stringify({available:false,message:'The requested comparison scope is not available.'})); return;
        }
        if (bases.length > 1 || (bases[0]?.length ?? 0) > 1024) {
          res.writeHead(400); res.end(JSON.stringify({available:false,message:'Choose one available comparison branch'})); return;
        }
        try {
          const comparisonGraph = scope === 'semantic' ? {nodes:semantic.symbols.map(symbol=>({id:symbol.id,path:symbol.path})),edges:semantic.relations.map(relation=>({from:relation.from,to:relation.to,evidencePath:relation.path}))} : data.graph;
          const comparison = await compareBranch(root, comparisonGraph, bases[0] ?? 'auto');
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify(comparison)); return;
        } catch (error) {
          if (error.code !== 'INVALID_BASE') throw error;
          res.writeHead(400); res.end(JSON.stringify({available:false,message:error.message})); return;
        }
      }
      if (url.pathname === '/source') {
        const relative = url.searchParams.get('path');
        if (!allowed.has(relative)) { res.writeHead(404); res.end('Source not included in diagram'); return; }
        const resolved = await realpath(path.resolve(root, relative));
        if (!within(root, resolved)) throw Error('Outside repository');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const info = await stat(resolved);
        const content = info.isDirectory() ? 'Directory: ' + relative + '\n\n' + (await readdir(resolved)).sort().join('\n') : await readFile(resolved);
        res.end(req.method === 'HEAD' ? undefined : content); return;
      }
      const publicPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const exports = new Set(['/diagram.json', '/architecture.mmd', ...data.views.map(view => '/' + view.id + '.mmd')]);
      const staticFiles = new Set(['/index.html', '/style.css', '/LICENSE', '/LICENSE-GitDiagram', '/THIRD_PARTY_NOTICES.md']);
      const base = exports.has(publicPath) ? out : runtime;
      if (!exports.has(publicPath) && !staticFiles.has(publicPath) && !/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|txt)$/.test(publicPath)) throw Error('Outside public assets');
      const requested = path.resolve(base, '.' + publicPath);
      if (!within(base, requested)) throw Error('Outside public assets');
      const resolved = await realpath(requested);
      if (!within(base, resolved)) throw Error('Outside public assets');
      res.setHeader('Content-Type', mime[path.extname(resolved)] || 'text/plain; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : await readFile(resolved));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.BITMAP_PORT || 4318);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('BITMAP_PORT must be an integer between 1 and 65535');
  const server = await createAppServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`BitMap: http://127.0.0.1:${port}`));
}
