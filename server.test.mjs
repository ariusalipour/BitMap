import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createAppServer } from './server.mjs';

let server;
let port;
before(async () => {
  server = await createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});
after(async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); });
function request(path, options = {}) {
  const { body: payload, ...requestOptions } = options;
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, ...requestOptions }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
}
const rpc = (method, params = {}) => request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { jsonrpc: '2.0', id: 1, method, params } });

test('serves the self-contained demo with local navigation only', async () => {
  const r = await request('/diagram.json');
  assert.equal(r.status, 200);
  const data = JSON.parse(r.body);
  assert.equal(data.title, 'BitMap');
  assert.equal(data.validation.valid, true);
  assert.equal(data.graph.nodes.length, 8);
  assert.equal(data.views.length, 2);
  for (const view of data.views) {
    assert.ok(view.mermaid.startsWith('flowchart TD'));
    assert.doesNotMatch(view.mermaid, /https?:\/\/|^\s*click\s/m);
  }
  assert.match(r.headers['content-security-policy'], /connect-src 'self'/);
  assert.match((await request('/')).body, /BitMap home/);
});

test('reads a graph-linked source file and serves it as inert text', async () => {
  const file = await request('/source?path=server.mjs');
  assert.equal(file.status, 200);
  assert.match(file.body, /createAppServer/);
  assert.match(file.headers['content-type'], /text\/plain/);
});

test('rejects unlisted files, traversal, private compiler assets and writes', async () => {
  for (const target of ['/source?path=.env', '/source?path=README.md', '/source?path=..%2FREADME.md', '/%2e%2e/package.json', '/compiler.mjs']) {
    assert.equal((await request(target)).status, 404, target);
  }
  assert.equal((await request('/', { method: 'POST' })).status, 403);
  assert.equal((await request('/', { headers: { Host: 'untrusted.example' } })).status, 403);
});

test('serves scripts, exports and licence notices', async () => {
  const js = await request('/assets/viewer.js');
  assert.equal(js.status, 200);
  assert.equal(js.headers['content-type'], 'text/javascript');
  assert.equal(js.headers['x-content-type-options'], 'nosniff');
  const bootstrap = await request('/assets/theme-bootstrap.js');
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.headers['content-type'], 'text/javascript');
  assert.equal((await request('/architecture.mmd')).status, 200);
  assert.match((await request('/LICENSE-GitDiagram')).body, /Copyright \(c\) 2024 Ahmed Khaleel/);
  assert.match((await request('/LICENSE')).body, /MIT License/);
});

test('MCP initialises, lists a read-only tool and limits lookup to the configured map', async () => {
  const init = await rpc('initialize');
  assert.equal(JSON.parse(init.body).result.serverInfo.name, 'bitmap');
  const tools = await rpc('tools/list');
  assert.equal(JSON.parse(tools.body).result.tools[0].annotations.openWorldHint, false);
  const map = await rpc('tools/call', { name: 'get_repository_diagram', arguments: { repository: 'BitMap' } });
  const data = JSON.parse(map.body).result.structuredContent;
  assert.equal(data.localViewerUrl, `http://127.0.0.1:${port}`);
  assert.equal(typeof data.workingTreeDirty, 'boolean');
  assert.ok(Object.keys(data.reviewedFileHashes).length > 0);
  const absent = await rpc('tools/call', { name: 'get_repository_diagram', arguments: { repository: 'someone/other' } });
  assert.equal(JSON.parse(absent.body).result.isError, true);
});

test('MCP rejects cross-origin requests and malformed input', async () => {
  assert.equal((await request('/mcp')).status, 405);
  const origin = await request('/mcp', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: { id: 1, method: 'tools/list' } });
  assert.equal(origin.status, 403);
  assert.equal((await request('/mcp', { method: 'POST', body: null })).status, 400);
});

test('branch comparison uses the configured repository and restricts base options', async () => {
  const result = await request('/comparison?base=auto');
  assert.equal(result.status, 200);
  assert.match(result.headers['content-type'], /application\/json/);
  const comparison = JSON.parse(result.body);
  assert.equal(typeof comparison.available, 'boolean');
  if (comparison.available) {
    assert.equal(comparison.scope, 'committed');
    assert.ok(Array.isArray(comparison.files));
    assert.ok(comparison.nodes.every(node => node.reasons.every(reason => ['source', 'evidence'].includes(reason.kind))));
  }
  for (const base of ['--output=bad', 'HEAD', 'main&base=master', '..%2Fmain']) assert.equal((await request('/comparison?base='+base)).status,400);
  assert.equal((await request('/comparison',{method:'POST'})).status,403);
  assert.equal((await request('/comparison',{headers:{Origin:'https://untrusted.example'}})).status,403);
});
