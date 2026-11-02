// Local architecture workspace, using upstream rendering and explicit click-versus-pan handling.
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { buildMermaidConfig, MERMAID_SVG_SANITIZE_OPTIONS } from './vendor/gitdiagram/src/features/diagram/mermaid-config';
import { sanitizeMermaidSourceForRender } from './vendor/gitdiagram/src/features/diagram/mermaid-security';
import { createViewport } from './vendor/gitdiagram/src/mcp-app/viewport';
import { installDiagramInteractions } from './diagram-interactions';
import { getComponentAppearance } from './component-icons';
import { createThemeController, type Theme } from './theme';
import { createComparisonController } from './comparison-ui';

type Node = { id: string; label: string; type: string; description: string | null; groupId: string | null; path: string | null; shape?: string | null };
type Edge = { from: string; to: string; label: string | null; evidencePath?: string | null };
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const emptyInspector = $('detail').innerHTML;
let viewport: ReturnType<typeof createViewport> | undefined;
let renderedSvg: SVGSVGElement | undefined;
let selectedId: string | null = null;
function diagramPalette() {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: value('--canvas'), node: value('--diagram-node'), border: value('--diagram-border'),
    text: value('--diagram-text'), edge: value('--diagram-edge'), cluster: value('--diagram-cluster'),
    clusterBorder: value('--diagram-cluster-border'), label: value('--diagram-label-bg'),
    changed: value('--change-border'), changedFill: value('--change-fill'), selected: value('--accent'), selectedFill: value('--selected-fill'),
  };
}
function applyDiagramTheme(svg: SVGSVGElement) {
  const p = diagramPalette();
  let style = svg.querySelector<SVGStyleElement>('[data-bitmap-theme]');
  if (!style) { style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.setAttribute('data-bitmap-theme', ''); svg.append(style); }
  // Literal colours keep exported SVGs independent of the application stylesheet.
  style.textContent = `
    #local-architecture { background:${p.background}; color:${p.text}; }
    #local-architecture .node rect, #local-architecture .node polygon, #local-architecture .node path,
    #local-architecture .node circle, #local-architecture .node ellipse { fill:${p.node}!important; stroke:${p.border}!important; }
    #local-architecture text, #local-architecture tspan { fill:${p.text}!important; color:${p.text}!important; }
    #local-architecture .cluster rect { fill:${p.cluster}!important; stroke:${p.clusterBorder}!important; }
    #local-architecture .flowchart-link, #local-architecture .edgePaths path { stroke:${p.edge}!important; }
    #local-architecture marker path { fill:${p.edge}!important; stroke:${p.edge}!important; }
    #local-architecture .edgeLabel rect, #local-architecture .labelBkg { fill:${p.label}!important; }
    #local-architecture .node.change-source :is(rect,polygon,path,circle,ellipse),
    #local-architecture .node.change-evidence :is(rect,polygon,path,circle,ellipse) { fill:${p.changedFill}!important; stroke:${p.changed}!important; stroke-width:2.5px!important; }
    #local-architecture .node.change-evidence :is(rect,polygon,path,circle,ellipse) { stroke-dasharray:5 3!important; }
    #local-architecture .node [data-change-label] { fill:${p.changed}!important; }
    #local-architecture .node.selected :is(rect,polygon,path,circle,ellipse) { stroke:${p.selected}!important; stroke-width:3px!important; }
    #local-architecture .node.selected:not(.change-source):not(.change-evidence) :is(rect,polygon,path,circle,ellipse) { fill:${p.selectedFill}!important; }
    #local-architecture .node:focus-visible :is(rect,polygon,path,circle,ellipse) { stroke:${p.selected}!important; stroke-width:3px!important; }
  `;
}
function updateTheme(theme: Theme) {
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  $('theme-toggle').setAttribute('aria-label', label);
  $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
  $('theme-toggle').title = label;
  if (renderedSvg) applyDiagramTheme(renderedSvg);
}
let themeStorage: Storage | undefined;
try { themeStorage = window.localStorage; } catch { /* Storage can be disabled. */ }
const theme = createThemeController(document.documentElement, themeStorage, window.matchMedia('(prefers-color-scheme: dark)'), updateTheme);
$('theme-toggle').addEventListener('click', () => theme.toggle());
const data = await fetch('/diagram.json').then(r => { if (!r.ok) throw Error('Cannot load local map'); return r.json(); });
document.title = data.title === 'BitMap' ? 'BitMap — Code architecture' : `${data.title} — BitMap`;
$('project-title').textContent = data.title;
const exportName = data.title.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'bitmap';
const graph = data.graph as { nodes: Node[]; edges: Edge[]; groups: {id:string;label:string}[] };
let activeGraph = data.views[0].graph as typeof graph;
const groups = new Map(graph.groups.map(g => [g.id,g.label]));
const byId = new Map(graph.nodes.map(n => [n.id,n]));
const appearances = new Map(graph.nodes.map(n => [n.id,getComponentAppearance(n)]));
const search = $('search') as HTMLInputElement;
const viewSelect = $('view') as HTMLSelectElement;
installDiagramInteractions($('stage'));
const comparison = createComparisonController(() => {
  comparison.annotate(renderedSvg);
  const detail = $('detail').querySelector('[data-comparison-detail]');
  if (detail) detail.innerHTML = comparison.inspector(selectedId);
});

function panel(name: 'navigator' | 'inspector', open: boolean) {
  document.body.dataset[name] = open ? 'open' : 'closed';
  $(name === 'navigator' ? 'toggle-components' : 'toggle-inspector').setAttribute('aria-expanded', String(open));
}
panel('navigator',innerWidth > 700); panel('inspector',innerWidth >= 1200);
$('toggle-components').addEventListener('click', () => panel('navigator',document.body.dataset.navigator !== 'open'));
$('toggle-inspector').addEventListener('click', () => panel('inspector',document.body.dataset.inspector !== 'open'));
$('close-inspector').addEventListener('click', () => panel('inspector',false));
const date = new Date(data.builtAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
$('snapshot-label').textContent = 'Snapshot · ' + date;
$('provenance').textContent = `Baseline ${data.sourceCommit.slice(0,7)}${data.workingTreeDirty ? ' + working tree' : ''}\nGitDiagram ${data.upstreamCommit.slice(0,7)}`;

function syncSelection() {
  for(const button of document.querySelectorAll<HTMLButtonElement>('.component')) button.setAttribute('aria-pressed',String(button.dataset.id === selectedId));
  for(const element of document.querySelectorAll('#canvas .node')) {
    const selected = Boolean(selectedId && element.id.includes(`flowchart-node_${selectedId}-`));
    element.classList.toggle('selected',selected); element.setAttribute('aria-pressed',String(selected));
  }
}
function clearSelection() { selectedId = null; syncSelection(); $('detail').innerHTML = emptyInspector; }
function relationshipList(edges: Edge[],incoming: boolean) {
  return edges.map(e => {
    const other = byId.get(incoming ? e.from : e.to)!;
    const appearance = appearances.get(other.id)!;
    return `<div class="relation"><button class="relation-main" data-select="${esc(other.id)}" title="${esc(appearance.label)}">${appearance.svg}<span class="relation-copy">${esc(other.label)}<small>${esc(e.label || 'Connected')}</small></span><span class="sr-only">, ${esc(appearance.label)}</span></button>${e.evidencePath ? `<a class="relation-source" href="/source?path=${encodeURIComponent(e.evidencePath)}" target="_blank" rel="noopener" aria-label="Open evidence for ${esc(other.label)}" title="Open source evidence">↗</a>` : ''}</div>`;
  }).join('');
}
async function select(id: string) {
  const node = byId.get(id); if(!node) return;
  if(!activeGraph.nodes.some(n => n.id === id)) { viewSelect.value = 'all'; await renderView('all'); }
  selectedId = id; syncSelection(); panel('inspector',true);
  if(innerWidth <= 700) panel('navigator',false);
  const incoming = graph.edges.filter(e => e.to === id), outgoing = graph.edges.filter(e => e.from === id);
  const appearance = appearances.get(id)!;
  $('detail').innerHTML = `<p class="component-type" title="${esc(appearance.label)}">${appearance.svg}<span>${esc(node.type)}</span></p><h3 class="detail-title">${esc(node.label)}</h3>${groups.has(node.groupId!) ? `<p class="component-area">${esc(groups.get(node.groupId!)!)}</p>` : ''}${node.path ? `<a class="source-link" href="/source?path=${encodeURIComponent(node.path)}" target="_blank" rel="noopener" title="Open local source">${esc(node.path)} ↗</a>` : ''}<p class="description">${esc(node.description || node.type)}</p>${incoming.length ? `<h4 class="relations-heading">Incoming <span>${incoming.length}</span></h4>${relationshipList(incoming,true)}` : ''}${outgoing.length ? `<h4 class="relations-heading">Outgoing <span>${outgoing.length}</span></h4>${relationshipList(outgoing,false)}` : ''}<div data-comparison-detail>${comparison.inspector(id)}</div><button class="clear-selection">Clear selection</button>`;
  for(const button of $('detail').querySelectorAll<HTMLButtonElement>('[data-select]')) button.addEventListener('click',() => select(button.dataset.select!));
  $('detail').querySelector('.clear-selection')!.addEventListener('click',clearSelection);
}
function componentIndex() {
  const query = search.value.toLowerCase();
  const matches = activeGraph.nodes.filter(n => `${n.label} ${n.description} ${n.path}`.toLowerCase().includes(query));
  $('count').textContent = query ? `${matches.length} / ${activeGraph.nodes.length}` : String(activeGraph.nodes.length);
  $('components').innerHTML = graph.groups.map(g => {
    const nodes = matches.filter(n => n.groupId === g.id);
    return nodes.length ? `<p class="group-label">${esc(g.label)}</p>${nodes.map(n => {
      const appearance = appearances.get(n.id)!;
      return `<button class="component" data-id="${esc(n.id)}" aria-pressed="${n.id === selectedId}" title="${esc(appearance.label)} · ${esc(n.type)}">${appearance.svg}<span>${esc(n.label)}</span><span class="sr-only">, ${esc(appearance.label)}</span></button>`;
    }).join('')}` : '';
  }).join('') || '<p class="empty">No matching components.<br>Try a different name or source path.</p>';
  for(const button of document.querySelectorAll<HTMLButtonElement>('.component')) button.addEventListener('click',() => select(button.dataset.id!));
  comparison.annotate(renderedSvg);
}
search.addEventListener('input',componentIndex);

async function renderView(id: string) {
  const view = data.views.find((v: any) => v.id === id)!;
  activeGraph = view.graph;
  if(selectedId && !activeGraph.nodes.some(n => n.id === selectedId)) clearSelection();
  componentIndex();
  $('stats').textContent = `${activeGraph.nodes.length} components · ${activeGraph.edges.length} connections`;
  $('loading').hidden = false; viewSelect.disabled = true; renderedSvg = undefined; $('export').setAttribute('disabled','');
  viewport?.destroy(); viewport = undefined;
  try {
    const palette = diagramPalette();
    const config = buildMermaidConfig({isDark:theme.current === 'dark',backgroundColor:palette.background});
    mermaid.initialize({...config,fontFamily:"'Segoe UI', sans-serif",fontSize:14,
      themeVariables:{...config.themeVariables,lineColor:palette.edge,clusterBkg:palette.cluster,clusterBorder:palette.clusterBorder,fontSize:'14px',edgeLabelBackground:palette.label},
      flowchart:{...config.flowchart,nodeSpacing:36,rankSpacing:48}});
    const source = sanitizeMermaidSourceForRender(view.mermaid).replace(/^classDef (tone\w+) .*$/gm,`classDef $1 fill:${palette.node},stroke:${palette.border},stroke-width:1px,color:${palette.text}`);
    const result = await mermaid.render('local-architecture',source);
    $('canvas').innerHTML = DOMPurify.sanitize(result.svg,MERMAID_SVG_SANITIZE_OPTIONS);
    renderedSvg = $('canvas').querySelector('svg')!;
    for(const anchor of renderedSvg.querySelectorAll('a')) { anchor.removeAttribute('href'); anchor.removeAttribute('xlink:href'); }
    // Mermaid duplicates class colours as inline !important styles; let the
    // workspace's deliberate selected/focus state take precedence instead.
    for(const shape of renderedSvg.querySelectorAll<SVGElement>('.node rect,.node path,.node polygon,.node circle,.node ellipse')) {
      for(const property of ['fill','stroke','stroke-width']) {
        if(shape.style.getPropertyPriority(property) === 'important') shape.style.removeProperty(property);
      }
    }
    applyDiagramTheme(renderedSvg);
    viewport = createViewport($('stage'),$('canvas')); viewport.setTouchPanning(true); viewport.fit('whole');
    for(const node of renderedSvg.querySelectorAll<SVGGElement>('.node')) {
      const component = graph.nodes.find(n => node.id.includes(`flowchart-node_${n.id}-`));
      if(!component) continue;
      node.dataset.componentId = component.id; node.dataset.componentLabel = component.label;
      node.setAttribute('tabindex','0'); node.setAttribute('role','button'); node.setAttribute('aria-label',component.label);
      node.addEventListener('click',e => { e.stopPropagation(); select(component.id); });
      node.addEventListener('keydown',e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); select(component.id); } });
    }
    comparison.annotate(renderedSvg);
    syncSelection(); $('loading').hidden = true;
    $('status').textContent = `${view.label} · ${activeGraph.nodes.length} components · ${activeGraph.edges.length} connections`;
    ($('mermaid-export') as HTMLAnchorElement).href = `/${id}.mmd`;
    ($('mermaid-export') as HTMLAnchorElement).download = `${exportName}-${id}.mmd`;
    $('export').removeAttribute('disabled'); document.documentElement.dataset.rendered = 'true';
  } catch(e) { $('loading').textContent = 'Could not render this view. Reload to try again.'; $('status').textContent = 'Rendering error'; console.error(e); }
  finally { viewSelect.disabled = false; }
}
viewSelect.innerHTML = data.views.map((v: any) => `<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('');
viewSelect.addEventListener('change',() => renderView(viewSelect.value));
$('stage').addEventListener('click',e => { if(!(e.target as Element).closest('.node')) clearSelection(); });
$('stage').addEventListener('keydown',e => { if(e.key === 'Escape') clearSelection(); });
document.addEventListener('keydown',e => { if(e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); panel('navigator',true); search.focus(); } });
$('in').addEventListener('click',() => viewport?.step(1)); $('out').addEventListener('click',() => viewport?.step(-1));
$('fit').addEventListener('click',() => viewport?.fit('whole')); $('readable').addEventListener('click',() => viewport?.fit('readable'));
$('export').addEventListener('click',() => {
  if(!renderedSvg) return;
  const clone = renderedSvg.cloneNode(true) as SVGSVGElement;
  for(const node of clone.querySelectorAll('.node')) { node.classList.remove('selected'); node.removeAttribute('tabindex'); node.removeAttribute('role'); node.removeAttribute('aria-pressed'); }
  const box = clone.getAttribute('viewBox')?.split(/\s+/).map(Number);
  if(box?.length === 4) { clone.setAttribute('width',String(box[2])); clone.setAttribute('height',String(box[3])); }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
  const a = document.createElement('a'); a.href = url; a.download = `${exportName}-${viewSelect.value}.svg`; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
await renderView(data.views[0].id);
