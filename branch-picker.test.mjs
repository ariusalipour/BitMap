import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const {code} = await transform(await readFile(new URL('./branch-picker.ts',import.meta.url),'utf8'), {loader:'ts',format:'esm'});
const {filterBranches,moveBranchIndex,createBranchPicker} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const branches = [
  {ref:'refs/heads/Feature/One',name:'Feature/One',kind:'local',current:true},
  {ref:'refs/remotes/origin/main',name:'origin/main',kind:'remote',current:false},
];
test('search matches names and canonical refs case-insensitively while retaining distinct branch identities',()=>{
  assert.deepEqual(filterBranches(branches,' FEATURE ').map(x=>x.ref),['refs/heads/Feature/One']);
  assert.deepEqual(filterBranches(branches,'refs/remotes').map(x=>x.ref),['refs/remotes/origin/main']);
  assert.equal(filterBranches(branches,'').length,3);
  assert.equal(filterBranches(branches,'missing').length,0);
});
test('keyboard movement wraps and handles empty filtered lists',()=>{
  assert.equal(moveBranchIndex(0,'ArrowUp',3),2);
  assert.equal(moveBranchIndex(2,'ArrowDown',3),0);
  assert.equal(moveBranchIndex(1,'Home',3),0);
  assert.equal(moveBranchIndex(1,'End',3),2);
  assert.equal(moveBranchIndex(0,'ArrowDown',0),-1);
});
class Element extends EventTarget {
  children=[]; attrs={}; hidden=false; disabled=false; value=''; textContent='';
  classList={toggle(){}};
  setAttribute(k,v){this.attrs[k]=v;} removeAttribute(k){delete this.attrs[k];}
  append(...children){this.children.push(...children);} replaceChildren(){this.children=[];}
  focus(){this.focused=true;} scrollIntoView(){} contains(el){return el===this || this.children.some(c=>c.contains(el));}
}
function fixture() {
  const oldDocument=globalThis.document,oldFetch=globalThis.fetch;
  const elements=new Map(['compare-base','branch-picker-panel','branch-search','branch-options','branch-picker-status','branch-picker-retry','branch-picker'].map(id=>[id,new Element()]));
  elements.get('branch-picker-panel').hidden=true;
  elements.get('branch-picker').append(...[...elements].filter(([id])=>id!=='branch-picker').map(([,el])=>el));
  globalThis.document=Object.assign(new EventTarget(),{getElementById:id=>elements.get(id),createElement:()=>new Element()});
  const requests=[];globalThis.fetch=url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}));
  let changes=0;const picker=createBranchPicker(()=>changes++);
  const fire=(id,key)=>{const event=new Event(key?'keydown':'click',{cancelable:true});if(key)Object.defineProperty(event,'key',{value:key});elements.get(id).dispatchEvent(event);};
  const response=(index,payload)=>requests[index].resolve({ok:true,json:async()=>payload});
  return {elements,picker,requests,fire,response,get changes(){return changes;},restore(){globalThis.document=oldDocument;globalThis.fetch=oldFetch;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('picker fetches on demand, searches safely and selects by keyboard',async()=>{
  const f=fixture();try {
    assert.equal(f.requests.length,0);assert.equal(f.picker.value,'auto');
    f.picker.setEnabled(true);f.fire('compare-base');assert.equal(f.requests[0].url,'/branches');
    f.response(0,{available:true,branches});await settle();
    const search=f.elements.get('branch-search');search.value='Feature';search.dispatchEvent(new Event('input'));
    assert.equal(f.elements.get('branch-options').children.length,1);
    assert.equal(f.elements.get('branch-options').children[0].children[0].textContent,'Feature/One');
    assert.equal(search.attrs['aria-activedescendant'],'branch-option-refs%2Fheads%2FFeature%2FOne');
    f.fire('branch-search','Enter');assert.equal(f.picker.value,'refs/heads/Feature/One');assert.equal(f.changes,1);
    assert.equal(f.elements.get('branch-picker-panel').hidden,true);
  }finally{f.restore();}
});
test('stale inventory cannot overwrite newer results and missing selected refs stay selected',async()=>{
  const f=fixture();try {
    const first=f.picker.refresh(),second=f.picker.refresh();
    f.response(1,{available:true,branches});await second;
    f.response(0,{available:true,branches:[]});await first;
    assert.equal(f.elements.get('branch-options').children.length,3);
    f.elements.get('branch-options').children[1].dispatchEvent(new Event('click'));
    const refresh=f.picker.refresh();f.response(2,{available:true,branches:[]});await refresh;
    assert.equal(f.picker.value,'refs/heads/Feature/One');
    assert.match(f.elements.get('compare-base').textContent,/unavailable/);
  }finally{f.restore();}
});
test('loading errors support retry and escape returns focus without changing selection',async()=>{
  const f=fixture();try {
    f.fire('compare-base');f.requests[0].reject(Error('Offline'));await settle();
    assert.equal(f.elements.get('branch-picker-status').textContent,'Offline');assert.equal(f.elements.get('branch-picker-retry').hidden,false);
    f.fire('branch-picker-retry');f.response(1,{available:true,branches});await settle();
    assert.equal(f.elements.get('branch-picker-retry').hidden,true);
    f.fire('branch-search','Escape');assert.equal(f.picker.value,'auto');
    assert.equal(f.elements.get('branch-picker-panel').hidden,true);assert.equal(f.elements.get('compare-base').focused,true);
  }finally{f.restore();}
});
