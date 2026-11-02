// Source-backed navigation keeps the complete index searchable while diagrams stay focused.
import { getComponentAppearance } from './component-icons';
export type SymbolInfo = { id:string; name:string; kind:string; path:string; parentId?:string; range:{startLine:number;endLine:number}; signature?:string; description?:string; descriptionSource?:string; modifiers?:string[]; exported?:boolean; parameters?:{name:string;type:string}[]; returnType?:string };
type Relation = {from:string;to:string;kind:string;path?:string;line?:number};
// Group repeated call sites without losing direction or confusing JSX rendering with calls.
export function symbolCallRelations(id:string, relations:Relation[], direction:'incoming'|'outgoing') {
  const groups=new Map<string,{id:string;kind:string;sites:Relation[]}>();
  for(const relation of relations) {
    if(!['calls','renders'].includes(relation.kind) || relation[direction==='incoming'?'to':'from']!==id) continue;
    const partner=relation[direction==='incoming'?'from':'to'], key=`${partner}\0${relation.kind}`;
    if(!groups.has(key)) groups.set(key,{id:partner,kind:relation.kind,sites:[]});
    const sites=groups.get(key)!.sites;
    if(!sites.some(site=>site.path===relation.path && site.line===relation.line)) sites.push(relation);
  }
  return [...groups.values()];
}
const esc = (s:unknown) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function filterSymbols(symbols:SymbolInfo[], query:string) { const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean); return symbols.filter(s=>words.every(w=>`${s.name} ${s.path} ${s.kind} ${s.signature ?? ''} ${s.description ?? ''}`.toLowerCase().includes(w))); }
export function symbolTrail(symbol:SymbolInfo|undefined, byId:Map<string,SymbolInfo>) { const result:SymbolInfo[]=[]; const seen=new Set<string>(); while(symbol && !seen.has(symbol.id)) { seen.add(symbol.id); result.unshift(symbol); symbol=byId.get(symbol.parentId!); } return result; }
export function scopedSymbols(symbols:SymbolInfo[], focus:string|undefined, mode:string, viewIds:ReadonlySet<string>=new Set()) {
  if(!focus) return symbols.filter(s=>!s.parentId);
  if(mode==='children') return symbols.filter(s=>s.id===focus || s.parentId===focus);
  return symbols.filter(s=>s.id===focus || viewIds.has(s.id));
}
export function createSemanticExplorer(options:{render:(view:any)=>Promise<void>;restore:()=>Promise<void>;changed:(active:boolean)=>void;indexed:()=>void;select:(id:string)=>Promise<void>|void}) {
  const $=(id:string)=>document.getElementById(id)!;
  let symbols:SymbolInfo[]=[], byId=new Map<string,SymbolInfo>(), active=false, focus:string|undefined, mode='children', request=0, available=false;
  let renderQueue=Promise.resolve();
  let viewIds=new Set<string>();
  let relations:Relation[]=[];
  const controls=$('semantic-controls'), notice=$('semantic-notice');
  const openIcon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h6v10H4zM17 4h4v4h-4zM17 16h4v4h-4zM10 12h4M14 6v12M14 6h3M14 18h3"/></svg>';
  function openButton(s:SymbolInfo) { return `<button class="semantic-open" data-open-symbol="${esc(s.id)}" aria-label="Open relationships for ${esc(s.name)}" title="Open relationships for ${esc(s.name)}">${openIcon}</button>`; }
  function symbolRow(s:SymbolInfo, component=false, extra='') { return `<div class="semantic-symbol-row"><button class="${component?'component semantic-component':'semantic-member'}" data-symbol="${esc(s.id)}" data-id="${esc(s.id)}" aria-pressed="false" title="${esc(s.path)}"><span>${getComponentAppearance({type:s.kind==='component'?'UI component':s.kind}).svg}</span><span>${esc(s.name)}<small>${esc(extra || `${s.kind} · ${s.path}`)}</small></span></button>${openButton(s)}</div>`; }
  function bindSymbols(container:HTMLElement) {
    container.querySelectorAll<HTMLButtonElement>('[data-symbol]').forEach(b=>b.onclick=()=>{void options.select(b.dataset.symbol!);});
    container.querySelectorAll<HTMLButtonElement>('[data-open-symbol]').forEach(b=>b.onclick=()=>open(b.dataset.openSymbol));
  }
  function index() {
    if(!active) return;
    const query=($('search') as HTMLInputElement).value;
    const matches=filterSymbols(symbols,query), visible=query.trim() ? matches : scopedSymbols(symbols,focus,mode,viewIds);
    $('count').textContent=String(visible.length);
    $('components').innerHTML=visible.slice(0,100).map(s=>symbolRow(s,true)).join('') || '<p class="empty">No symbols found in this scope. Search by name, kind or source path.</p>';
    if(visible.length>100) $('components').insertAdjacentHTML('beforeend',`<p class="empty">Showing 100 of ${visible.length}. Refine your search.</p>`);
    bindSymbols($('components'));
    options.indexed();
  }
  async function open(id?:string, nextMode=mode) {
    const version=++request; viewIds=new Set(); active=true; focus=id; mode=nextMode; options.changed(true); controls.hidden=false; $('view').hidden=true;
    $('explorer-toggle').setAttribute('aria-pressed','true');
    const trail=symbolTrail(byId.get(id!),byId);
    $('semantic-breadcrumb').innerHTML='<button data-focus="">Repository</button>'+trail.map(s=>`<span aria-hidden="true">/</span><button data-focus="${esc(s.id)}">${esc(s.name)}</button>`).join('');
    $('semantic-breadcrumb').querySelectorAll<HTMLButtonElement>('[data-focus]').forEach(b=>b.onclick=()=>open(b.dataset.focus||undefined));
    controls.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    index(); notice.textContent='Loading source relationships…';
    try {
      const params=new URLSearchParams({mode}); if(id) params.set('focus',id);
      const response=await fetch(`/semantic/view?${params}`); const view=await response.json(); if(version!==request || !active) return;
      if(!response.ok) throw Error(view.message||view.error||'Unable to load this code view.');
      viewIds=new Set(view.graph.nodes.map((node:{id:string})=>node.id));
      notice.textContent=`${focus ? `View centred on ${byId.get(focus)?.name ?? 'selected symbol'}. ` : ''}${view.truncated ? `Showing a focused subset of ${view.total} symbols. ` : ''}${mode==='calls'?'Arrows point from caller to callee; “renders” denotes JSX rendering. ':mode==='dependencies'?'Arrows point from a dependent to its dependency. ':'Arrows show containment. '}Click a symbol to inspect it; use its relationships icon to change the view. Dynamic relationships may be unresolved.`;
      renderQueue=renderQueue.catch(()=>{}).then(async()=>{ if(version===request && active) await options.render(view); });
      await renderQueue; if(version===request && active) index();
    } catch(error) { if(version===request) notice.textContent=error instanceof Error ? error.message : 'Unable to load this code view.'; }
  }
  async function restore() { ++request; viewIds=new Set(); active=false; focus=undefined; options.changed(false); controls.hidden=true; $('view').hidden=false; $('explorer-toggle').setAttribute('aria-pressed','false'); renderQueue=renderQueue.catch(()=>{}).then(()=>options.restore()); await renderQueue; }
  $('explorer-toggle').onclick=()=>active ? restore() : available ? open(undefined,'children') : undefined;
  controls.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.onclick=()=>open(focus,b.dataset.mode));
  $('search').addEventListener('input',()=>{if(active) index();});
  async function load() {
    try { const response=await fetch('/semantic'); const data=await response.json(); if(!response.ok || !data.available) throw Error(data.message||'No source index available. Refresh this repository with BitMap to analyse its code.');
      const generated=new Date(data.generatedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
      const stats=data.stats || {};
      $('semantic-analysis-summary').textContent=`Source index · ${stats.files ?? 0} files · ${data.symbols.length} symbols · ${stats.relations ?? 0} relationships`;
      $('semantic-analysis-details').innerHTML=`<p>Analysed ${esc(generated)}. This is a source snapshot; run BitMap again to refresh it.</p><ul>${(data.diagnostics || []).map((d:unknown)=>`<li>${esc(typeof d==='string' ? d : JSON.stringify(d))}</li>`).join('')}</ul>`;
      symbols=data.symbols; relations=data.relations ?? []; byId=new Map(symbols.map(s=>[s.id,s])); available=true;
      $('explorer-toggle').removeAttribute('disabled'); $('explorer-toggle').title=`Explore ${symbols.length} source symbols`;
      if(!symbols.length) { available=false; $('explorer-toggle').setAttribute('disabled',''); $('explorer-toggle').title='No supported JavaScript or TypeScript symbols found.'; }
    } catch(error) { $('explorer-toggle').setAttribute('disabled',''); $('explorer-toggle').title=error instanceof Error ? error.message : 'Source analysis unavailable'; }
  }
  function inspector(id:string) {
    const s=byId.get(id); if(!active || !s) return '';
    const children=symbols.filter(child=>child.parentId===id);
    const relationSection=(direction:'incoming'|'outgoing')=>{
      const entries=symbolCallRelations(id,relations,direction), title=direction==='incoming'?'Called by / rendered by':'Calls / renders';
      return `<h4>${title} <span>${entries.length}</span></h4>${entries.length ? entries.slice(0,40).map(entry=>{const partner=byId.get(entry.id); if(!partner) return ''; const verb=entry.kind==='renders'?(direction==='incoming'?'renders this symbol':'rendered by this symbol'):(direction==='incoming'?'calls this symbol':'called by this symbol'); return symbolRow(partner,false,`${verb} · ${entry.sites.length} source ${entry.sites.length===1?'site':'sites'}`);}).join('') : '<p class="semantic-empty">No resolved static relationships.</p>'}${entries.length>40?`<p class="semantic-empty">Showing 40 of ${entries.length} relationships. Open this symbol’s relationships to explore further.</p>`:''}`;
    };
    return `<section class="semantic-details"><p class="semantic-provenance">${s.descriptionSource==='curated' ? 'Developer description' : s.descriptionSource==='jsdoc' ? 'Documentation comment' : 'Source declaration · no documentation comment'}</p>${s.description ? `<p class="description">${esc(s.description)}</p>` : ''}${s.signature ? `<pre class="symbol-signature">${esc(s.signature)}</pre>` : ''}<p class="symbol-location">Lines ${s.range.startLine}–${s.range.endLine}${s.exported ? ' · exported' : ''}${s.modifiers?.length ? ` · ${esc(s.modifiers.join(', '))}` : ''}</p>${s.parameters?.length ? `<h4>Parameters</h4><dl class="symbol-parameters">${s.parameters.map(p=>`<dt>${esc(p.name)}</dt><dd>${esc(p.type||'inferred')}</dd>`).join('')}</dl>` : ''}${s.returnType ? `<h4>Returns</h4><pre class="symbol-signature">${esc(s.returnType)}</pre>` : ''}<button data-open-symbol="${esc(id)}">${openIcon} Open relationships</button>${relationSection('incoming')}${relationSection('outgoing')}${children.length ? `<h4>Members <span>${children.length}</span></h4>${children.slice(0,40).map(c=>symbolRow(c)).join('')}${children.length>40 ? '<p>Explore this symbol to see more members.</p>' : ''}` : ''}</section>`;
  }
  function bindInspector() { bindSymbols($('detail')); }
  function moduleForPath(path:string) { return symbols.find(s=>s.path===path && !s.parentId); }
  function node(id:string) { const s=byId.get(id); return s ? {id:s.id,label:s.name,type:s.kind==='component'?'UI component':s.kind,description:s.description ?? null,groupId:'source',path:s.path,shape:'box',semantic:s} : undefined; }
  return {load,open,restore,index,inspector,bindInspector,moduleForPath,node,get active(){return active;}};
}
