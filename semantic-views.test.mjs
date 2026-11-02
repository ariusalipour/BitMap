/** Focused view contract: bounded output, exact relationships, inert labels and explicit curation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSemanticView, applySemanticOverrides } from './semantic-views.mjs';

const symbol = (id, kind = 'module', parentId = null) => ({ id, name: id, kind, parentId, path: `src/${id}.ts`, description: 'Source docs', descriptionSource: 'jsdoc', signature: `${id}(): void`, range: { startLine: 1, endLine: 4 } });

test('large indexes produce bounded deterministic pages while retaining the full index', () => {
  const index = { symbols: Array.from({ length: 200 }, (_, i) => symbol(`m_${String(i).padStart(3, '0')}`)), relations: [] };
  const first = buildSemanticView(index);
  const next = buildSemanticView(index, { offset: 30 });
  assert.equal(first.graph.nodes.length, 30);
  assert.equal(first.total, 200);
  assert.equal(first.truncated, true);
  assert.equal(next.graph.nodes[0].id, 'm_030');
  assert.equal(new Set([...first.graph.nodes, ...next.graph.nodes].map(node => node.id)).size, 60);
  assert.equal(index.symbols.length, 200);
  assert.deepEqual(buildSemanticView(index), first);
  assert.throws(() => buildSemanticView(index, { limit: 35 }), /limit/);
  assert.throws(() => buildSemanticView(index, { offset: -1 }), /offset/);
});

test('containment focuses direct children and retains their signatures and source ranges', () => {
  const index = { symbols: [symbol('m'), symbol('c', 'class', 'm'), symbol('method', 'method', 'c')], relations: [] };
  const view = buildSemanticView(index, { focus: 'c' });
  assert.deepEqual(view.graph.nodes.map(node => node.id), ['c', 'method']);
  assert.equal(view.graph.edges[0].label, 'contains');
  assert.equal(view.graph.nodes[1].semantic.signature, 'method(): void');
  assert.equal(view.graph.nodes[1].semantic.range.startLine, 1);
  assert.throws(() => buildSemanticView(index, { focus: 'missing' }), /not found/);
});

test('call and dependency views preserve incoming and outgoing directions without inventing data flow', () => {
  const index = { symbols: ['a', 'b', 'c', 'd'].map(id => symbol(id, 'function')), relations: [
    { from: 'a', to: 'b', kind: 'calls', path: 'src/a.ts' },
    { from: 'c', to: 'a', kind: 'renders', path: 'src/c.ts' },
    { from: 'a', to: 'd', kind: 'imports', path: 'src/a.ts' },
  ] };
  const calls = buildSemanticView(index, { focus: 'a', mode: 'calls' });
  assert.deepEqual(calls.graph.edges.map(edge => [edge.from, edge.to, edge.label]), [['a', 'b', 'calls'], ['c', 'a', 'renders']]);
  assert.equal(calls.graph.edges[1].evidencePath, 'src/c.ts');
  const dependencies = buildSemanticView(index, { focus: 'a', mode: 'dependencies' });
  assert.deepEqual(dependencies.graph.nodes.map(node => node.id), ['a', 'd']);
  assert.equal(dependencies.graph.edges[0].style, 'dashed');
});

test('dense relationships respect rendering caps independently of index size', () => {
  const symbols = Array.from({ length: 34 }, (_, i) => symbol(`s_${i}`, 'function'));
  const relations = symbols.flatMap(from => symbols.filter(to => from !== to).map(to => ({ from: from.id, to: to.id, kind: 'calls' })));
  const view = buildSemanticView({ symbols, relations }, { focus: 's_0', mode: 'calls', limit: 34 });
  assert.equal(view.graph.nodes.length, 34);
  assert.equal(view.graph.edges.length, 48);
  assert.ok(view.graph.groups.length <= 10);
  assert.equal(view.truncated, true);
});

test('labels cannot introduce Mermaid markup or directives and source paths remain data', () => {
  const malicious = { ...symbol('safe'), name: '"]\nclick node_safe "https://evil.test" <script>& %%{init}%%', path: 'src/<file>.ts' };
  const view = buildSemanticView({ symbols: [malicious], relations: [] });
  assert.equal(view.mermaid.split('\n').length, 4);
  assert.ok(!view.mermaid.includes('<script>'));
  assert.ok(!view.mermaid.includes('%%{'));
  assert.ok(!/^\s*click\s/m.test(view.mermaid));
  assert.ok(view.mermaid.includes('#34;'));
  assert.equal(view.graph.nodes[0].path, 'src/<file>.ts');
  assert.throws(() => buildSemanticView({ symbols: [symbol('unsafe-id')], relations: [] }), /unsafe/);
});

test('curated descriptions preserve source facts, mark provenance and do not mutate the generated index', () => {
  const index = { symbols: [symbol('a')], relations: [] };
  const curated = applySemanticOverrides(index, { descriptions: { a: 'Team explanation' } });
  assert.equal(curated.symbols[0].description, 'Team explanation');
  assert.equal(curated.symbols[0].descriptionSource, 'curated');
  assert.equal(curated.symbols[0].signature, index.symbols[0].signature);
  assert.equal(index.symbols[0].description, 'Source docs');
  assert.equal(buildSemanticView(curated).graph.nodes[0].semantic.descriptionProvenance, 'authored');
});
