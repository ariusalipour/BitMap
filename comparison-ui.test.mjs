import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const bundle = await build({entryPoints:[fileURLToPath(new URL('./comparison-ui.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser'});
const code = bundle.outputFiles[0].text;
const {createComparisonController} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function fixture() {
  const elements = new Map(['compare-toggle','compare-base','compare-refresh','comparison-strip','comparison-status'].map(id => [id, Object.assign(new EventTarget(), {attrs:{},setAttribute(k,v){this.attrs[k]=v;},value:'auto',hidden:false,disabled:false,textContent:''})]));
  const components = [];
  const previousDocument = globalThis.document, previousFetch = globalThis.fetch;
  globalThis.document = {body:{dataset:{}},getElementById:id=>elements.get(id),querySelectorAll:()=>components,createElement:()=>({className:'',textContent:''})};
  const requests = [];
  globalThis.fetch = url => new Promise((resolve,reject)=>requests.push({url,resolve,reject}));
  const controller = createComparisonController(()=>controller.annotate(),onSelect=>{
    const element=elements.get('compare-base');
    element.addEventListener('change',onSelect);
    return {get value(){return element.value;},setEnabled(enabled){element.disabled=!enabled;},async refresh(){}};
  });
  const fire = (id,event='click') => elements.get(id).dispatchEvent(new Event(event));
  const response = (index,payload) => requests[index].resolve({ok:true,json:async()=>payload});
  return {elements,components,requests,controller,fire,response,restore(){globalThis.document=previousDocument;globalThis.fetch=previousFetch;}};
}
const settle = () => new Promise(resolve=>setImmediate(resolve));
const available = nodes => ({available:true,branch:'feature',base:'main',files:[{}],nodes,unmappedFiles:[],scope:'committed'});
test('turning comparison off discards in-flight results and clears highlights', async()=>{
  const f=fixture();try {
    f.fire('compare-toggle'); assert.equal(f.requests[0].url,'/comparison?base=auto');
    f.fire('compare-toggle'); f.response(0,available([{id:'a',reasons:[{kind:'source',path:'a.ts',status:'M'}]}])); await settle();
    assert.deepEqual(f.controller.reasons('a'),[]);
    assert.equal(f.elements.get('comparison-strip').hidden,true);
    assert.equal(f.elements.get('compare-toggle').attrs['aria-pressed'],'false');
  } finally { f.restore(); }
});
test('changing base ignores an older response and uses the latest comparison',async()=>{
  const f=fixture();try {
    f.fire('compare-toggle');f.elements.get('compare-base').value='master';f.fire('compare-base','change');
    f.response(1,available([{id:'latest',reasons:[{kind:'source',path:'b.ts',status:'A'}]}]));await settle();
    f.response(0,available([{id:'stale',reasons:[{kind:'source',path:'a.ts',status:'M'}]}]));await settle();
    assert.equal(f.controller.reasons('latest').length,1);assert.deepEqual(f.controller.reasons('stale'),[]);
  } finally { f.restore(); }
});
test('failed requests offer retry and a successful retry recovers',async()=>{
  const f=fixture();try {
    f.fire('compare-toggle');f.requests[0].reject(Error('Offline'));await settle();
    assert.equal(f.elements.get('compare-refresh').textContent,'Retry');assert.equal(f.elements.get('comparison-status').textContent,'Offline');
    f.fire('compare-refresh');f.response(1,{...available([]),files:[]});await settle();
    assert.equal(f.elements.get('compare-refresh').textContent,'Refresh');assert.match(f.elements.get('comparison-status').textContent,/No committed changes/);
  } finally { f.restore(); }
});
test('inspector escapes repository paths and source changes take badge priority over evidence',async()=>{
  const f=fixture();try {
    const component={dataset:{id:'a'},badges:[],querySelector(){return undefined;},append(badge){this.badges.push(badge);}};f.components.push(component);
    f.fire('compare-toggle');f.response(0,available([{id:'a',reasons:[{kind:'evidence',path:'edge.ts',status:'M'},{kind:'source',path:'<script>.ts',oldPath:'old&name.ts',status:'R100'}]}]));await settle();
    assert.equal(component.dataset.change,'source');assert.equal(component.badges.at(-1).textContent,'Changed');
    const html=f.controller.inspector('a');assert.match(html,/Connection evidence/);assert.match(html,/Renamed/);assert.match(html,/&lt;script&gt;\.ts/);assert.match(html,/old&amp;name\.ts/);assert.ok(!html.includes('<script>'));
  } finally { f.restore(); }
});
