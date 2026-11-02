/** Focused, bounded diagrams over the full source index. Relationships retain their extracted meaning. */
const MODES = new Set(['children', 'calls', 'dependencies']);
const CALLS = new Set(['calls', 'renders']);
const DEPENDENCIES = new Set(['imports', 'extends', 'implements']);
const text = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
const label = value => text(value).slice(0, 72) || 'Unnamed';
// Numeric entities keep quotes, markup and Mermaid punctuation inert inside quoted labels.
const escapeLabel = value => Array.from(label(value), char => /[a-zA-Z0-9 _.,:/-]/.test(char) ? char : `#${char.codePointAt(0)};`).join('');
const safeId = value => /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(value);
const byId = (a, b) => `${a.path}\0${a.name}\0${a.id}`.localeCompare(`${b.path}\0${b.name}\0${b.id}`, 'en');

export function applySemanticOverrides(index, overrides = {}) {
  const descriptions = overrides?.descriptions ?? {};
  return {
    ...index,
    symbols: index.symbols.map(symbol => Object.hasOwn(descriptions, symbol.id) && typeof descriptions[symbol.id] === 'string'
      ? { ...symbol, description: descriptions[symbol.id].slice(0, 4000), descriptionSource: 'curated', descriptionProvenance: 'authored' }
      : { ...symbol }),
  };
}

function renderMermaid(graph) {
  const lines = ['flowchart LR'];
  for (const group of graph.groups) {
    lines.push(`subgraph group_${group.id}["${escapeLabel(group.label)}"]`);
    for (const node of graph.nodes.filter(node => node.groupId === group.id)) lines.push(`node_${node.id}["${escapeLabel(node.label)}"]`);
    lines.push('end');
  }
  for (const node of graph.nodes.filter(node => !node.groupId)) lines.push(`node_${node.id}["${escapeLabel(node.label)}"]`);
  for (const edge of graph.edges) lines.push(`node_${edge.from} ${edge.style === 'dashed' ? '-.->' : '-->'}|"${escapeLabel(edge.label)}"| node_${edge.to}`);
  return lines.join('\n');
}

export function buildSemanticView(index, { focus = null, mode = 'children', limit = 30, offset = 0 } = {}) {
  if (!MODES.has(mode)) throw new Error('Unknown semantic view mode. Use children, calls or dependencies.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 34) throw new Error('Semantic view limit must be an integer from 1 to 34.');
  if (!Number.isInteger(offset) || offset < 0) throw new Error('Semantic view offset must be a non-negative integer.');
  const symbols = index.symbols ?? [];
  const lookup = new Map(symbols.map(symbol => [symbol.id, symbol]));
  const focused = focus ? lookup.get(focus) : null;
  if (focus && !focused) throw new Error('Semantic focus was not found in this source index.');
  const relations = index.relations ?? [];
  const relevantKinds = mode === 'calls' ? CALLS : mode === 'dependencies' ? DEPENDENCIES : new Set(['contains']);
  let candidates;
  if (!focused) candidates = symbols.filter(symbol => symbol.kind === 'module');
  else if (mode === 'children') candidates = symbols.filter(symbol => symbol.parentId === focus);
  else {
    const ids = new Set();
    for (const relation of relations) {
      if (!relevantKinds.has(relation.kind)) continue;
      if (relation.from === focus) ids.add(relation.to);
      if (relation.to === focus) ids.add(relation.from);
    }
    candidates = [...ids].map(id => lookup.get(id)).filter(Boolean);
  }
  candidates = candidates.filter(symbol => symbol.id !== focus).sort(byId);
  const total = candidates.length + (focused ? 1 : 0);
  const selected = [...(focused ? [focused] : []), ...candidates.slice(offset, offset + limit - (focused ? 1 : 0))];
  // Source index IDs are generated identifiers; reject unsafe hand-edited indexes rather than emitting syntax.
  if (selected.some(symbol => !safeId(symbol.id))) throw new Error('Semantic source index contains an unsafe symbol identifier.');
  const selectedIds = new Set(selected.map(symbol => symbol.id));
  const callRoles = new Map();
  if (mode === 'calls' && focused) {
    for (const relation of relations) {
      if (!CALLS.has(relation.kind)) continue;
      if (relation.to === focus && relation.from !== focus) callRoles.set(relation.from, (callRoles.get(relation.from) ?? 0) | 1);
      if (relation.from === focus && relation.to !== focus) callRoles.set(relation.to, (callRoles.get(relation.to) ?? 0) | 2);
    }
  }
  const nodes = selected.map(symbol => ({
    id: symbol.id, label: label(symbol.name ?? symbol.label ?? symbol.id), type: symbol.kind === 'component' ? 'UI component' : label(symbol.kind),
    description: symbol.description ? text(symbol.description).slice(0, 240) : null,
    groupId: 'source', path: symbol.path ?? null, shape: 'box', semantic: { ...symbol },
    ...(mode === 'calls' && focused ? { semanticRole: symbol.id === focus ? 'focus' : ({ 1: 'caller', 2: 'callee', 3: 'both' })[callRoles.get(symbol.id)] } : {}),
  }));
  let included = relations.filter(relation => relevantKinds.has(relation.kind) && selectedIds.has(relation.from) && selectedIds.has(relation.to));
  if (mode === 'calls') {
    // A focused call diagram answers who calls this symbol and what it calls.
    // Keep individual source sites in the index, but avoid parallel duplicate arrows.
    if (focused) included = included.filter(relation => relation.from === focus || relation.to === focus);
    const grouped = new Map();
    for (const relation of included) {
      const key = `${relation.from}\0${relation.to}\0${relation.kind}`;
      let group = grouped.get(key);
      if (!group) { group = { ...relation, sites: new Map() }; grouped.set(key, group); }
      const site = { path: relation.evidencePath ?? relation.path ?? lookup.get(relation.from)?.path ?? null, line: relation.line ?? null };
      group.sites.set(`${site.path}\0${site.line}`, site);
    }
    included = [...grouped.values()].map(({ sites, ...relation }) => ({ ...relation,
      evidence: [...sites.values()].sort((a, b) => String(a.path).localeCompare(String(b.path), 'en') || (a.line ?? 0) - (b.line ?? 0)),
      callSiteCount: sites.size,
    }));
  }
  // Containment is also available on symbols, including indexes with no redundant contains edges.
  if (mode === 'children') {
    const existing = new Set(included.map(edge => `${edge.from}\0${edge.to}`));
    included = [...included, ...selected.filter(symbol => selectedIds.has(symbol.parentId) && !existing.has(`${symbol.parentId}\0${symbol.id}`)).map(symbol => ({ from: symbol.parentId, to: symbol.id, kind: 'contains', path: symbol.path }))];
  }
  included.sort((a, b) => `${a.from}\0${a.to}\0${a.kind}`.localeCompare(`${b.from}\0${b.to}\0${b.kind}`, 'en'));
  const edges = included.slice(0, 48).map(relation => ({ from: relation.from, to: relation.to, label: relation.callSiteCount > 1 ? `${relation.kind} (${relation.callSiteCount} sites)` : relation.kind,
    description: null, style: relation.kind === 'imports' || relation.kind === 'implements' ? 'dashed' : 'solid',
    evidencePath: relation.evidencePath ?? relation.path ?? lookup.get(relation.from)?.path ?? null,
    ...(mode === 'calls' ? { callSiteCount: relation.callSiteCount, evidence: relation.evidence } : {}),
  }));
  const graph = { nodes, edges, groups: nodes.length ? [{ id: 'source', label: 'Source symbols', description: null }] : [] };
  return { id: `semantic_${mode}`, label: focused ? `${label(focused.name ?? focused.id)} · ${mode}` : 'Source modules', graph,
    mermaid: renderMermaid(graph), focus, mode, total, offset,
    truncated: offset > 0 || offset + Math.max(0, selected.length - (focused ? 1 : 0)) < candidates.length || included.length > 48 };
}
