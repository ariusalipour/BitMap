import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import { build } from 'esbuild';
const result=await build({entryPoints:[fileURLToPath(new URL('./semantic-explorer.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser'});
const {filterSymbols,symbolTrail,scopedSymbols,symbolCallRelations,createSemanticExplorer}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const symbols=[
 {id:'file',name:'auth.ts',kind:'module',path:'src/auth.ts'},
 {id:'class',name:'AuthService',kind:'class',path:'src/auth.ts',parentId:'file'},
 {id:'method',name:'signIn',kind:'method',path:'src/auth.ts',parentId:'class',signature:'signIn(token: string): Promise<User>',description:'Starts an authenticated session'},
 {id:'other',name:'Calendar',kind:'function',path:'src/calendar.ts'}
];
test('symbol search combines signature, source path, kind and documentation across the complete index',()=>{
 assert.deepEqual(filterSymbols(symbols,'METHOD promise').map(s=>s.id),['method']);
 assert.deepEqual(filterSymbols(symbols,'session auth.ts').map(s=>s.id),['method']);
 assert.equal(filterSymbols(symbols,'calendar').length,1);
 assert.equal(filterSymbols(symbols,'unresolved').length,0);
 assert.equal(filterSymbols(symbols,'  ').length,4);
});
test('breadcrumbs retain source containment order and tolerate missing or cyclic parents',()=>{
 const map=new Map(symbols.map(s=>[s.id,s]));
 assert.deepEqual(symbolTrail(map.get('method'),map).map(s=>s.id),['file','class','method']);
 assert.deepEqual(symbolTrail(undefined,map),[]);
 const broken={id:'broken',parentId:'missing'};map.set('broken',broken);
 assert.deepEqual(symbolTrail(broken,map),[broken]);
 const cyclic={id:'cycle',parentId:'cycle'};map.set('cycle',cyclic);
 assert.deepEqual(symbolTrail(cyclic,map),[cyclic]);
});

test('scope navigation shows leaf focus, direct structure members and current relationship participants',()=>{
 assert.deepEqual(scopedSymbols(symbols,'method','children').map(s=>s.id),['method']);
 assert.deepEqual(scopedSymbols(symbols,'class','children').map(s=>s.id),['class','method']);
 assert.deepEqual(scopedSymbols(symbols,'method','calls',new Set(['method','other'])).map(s=>s.id),['method','other']);
 assert.deepEqual(scopedSymbols(symbols,'class','dependencies',new Set(['file','class'])).map(s=>s.id),['file','class']);
 assert.deepEqual(scopedSymbols(symbols,'method','calls').map(s=>s.id),['method']);
 assert.deepEqual(scopedSymbols(symbols,undefined,'calls',new Set(['method'])).map(s=>s.id),['file','other']);
});

test('call inspector preserves direction and groups repeated call sites separately from JSX rendering',()=>{
 const relations=[{from:'other',to:'method',kind:'calls',line:1},{from:'other',to:'method',kind:'calls',line:2},{from:'other',to:'method',kind:'renders',line:3},{from:'method',to:'class',kind:'calls'},{from:'class',to:'method',kind:'imports'}];
 assert.deepEqual(symbolCallRelations('method',relations,'incoming').map(r=>[r.id,r.kind,r.sites.length]),[['other','calls',2],['other','renders',1]]);
 assert.deepEqual(symbolCallRelations('method',relations,'outgoing').map(r=>[r.id,r.kind]),[['class','calls']]);
});

// Small DOM boundary fixture: exercise real controller callbacks without a browser or a new DOM dependency.
test('search-result selection keeps the focused view while its explicit icon opens relationships',async()=>{
 class Element {
  value='';dataset={};attributes={};buttons=[];listeners={};hidden=false;textContent='';
  set innerHTML(html) {this.html=html;this.buttons=[...html.matchAll(/<button\b([^>]*)>/g)].map(match=>{const b=new Element();for(const a of match[1].matchAll(/([\w-]+)="([^"]*)"/g)){b.attributes[a[1]]=a[2];if(a[1].startsWith('data-'))b.dataset[a[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=a[2];}return b;});}
  get innerHTML(){return this.html;}
  querySelectorAll(selector){const key=selector.slice(1,-1);return this.buttons.filter(b=>Object.hasOwn(b.attributes,key));}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  addEventListener(k,v){this.listeners[k]=v;}
  insertAdjacentHTML(){}
 }
 const elements=new Map(), previousDocument=globalThis.document,previousFetch=globalThis.fetch;
 globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}};
 const requests=[],selected=[],rendered=[];
 globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>url==='/semantic'?{available:true,symbols:symbols.map(s=>({...s,range:{startLine:1,endLine:2}})),relations:[],generatedAt:'2026-01-01'}:{graph:{nodes:[{id:'class'},{id:'method'}]},total:2}};};
 try {
  const explorer=createSemanticExplorer({render:async v=>rendered.push(v),restore:async()=>{},changed:()=>{},indexed:()=>{},select:id=>selected.push(id)});
  await explorer.load();await explorer.open('class','calls');
  const search=elements.get('search');search.value='Calendar';search.listeners.input();
  const nav=elements.get('components'),before=requests.length,breadcrumb=elements.get('semantic-breadcrumb').innerHTML;
  nav.querySelectorAll('[data-symbol]')[0].onclick();
  assert.deepEqual(selected,['other']);assert.equal(requests.length,before);assert.equal(rendered.length,1);
  assert.equal(elements.get('semantic-breadcrumb').innerHTML,breadcrumb);assert.equal(search.value,'Calendar');
  assert.equal(explorer.node('other').path,'src/calendar.ts');assert.equal(explorer.node('missing'),undefined);
  await nav.querySelectorAll('[data-open-symbol]')[0].onclick();
  assert.match(requests.at(-1),/mode=calls&focus=other/);assert.equal(rendered.length,2);
  assert.match(explorer.inspector('other'),/Open relationships/);
  const detail=globalThis.document.getElementById('detail');detail.innerHTML=explorer.inspector('class');explorer.bindInspector();
  const beforeMember=requests.length;detail.querySelectorAll('[data-symbol]')[0].onclick();
  assert.equal(selected.at(-1),'method');assert.equal(requests.length,beforeMember);
  await detail.querySelectorAll('[data-open-symbol]').find(button=>button.dataset.openSymbol==='method').onclick();
  assert.match(requests.at(-1),/mode=calls&focus=method/);
 } finally {globalThis.document=previousDocument;globalThis.fetch=previousFetch;}
});
