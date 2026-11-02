// End-to-end source-only opening, curation, generated views and safe source browsing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {openRepository,parseArguments} from './cli.mjs';
import {createAppServer} from './server.mjs';

test('opens source without an authored graph and keeps its index outside the checkout',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'bitmap-semantic-open-'));
  const saved=[process.env.BITMAP_DATA_DIR,process.env.BITMAP_CACHE_DIR];
  process.env.BITMAP_DATA_DIR=path.join(temp,'data');process.env.BITMAP_CACHE_DIR=path.join(temp,'cache');
  let server;
  try {
    const root=path.join(temp,'repo');await mkdir(root);
    await writeFile(path.join(root,'service.ts'),'/** Doubles the input. */\nexport function twice(value: number): number { return value * 2; }\n/** Calculates a total. */\nexport class Calculator { total(value: number): number { return twice(value); } }');
    await writeFile(path.join(root,'.env'),'PRIVATE=example');
    const first=await openRepository({root,noServe:true});
    assert.equal(first.workspace.graph,undefined);
    assert.deepEqual(await readdir(path.join(root,'bitmap')),['config.json']);
    const index=JSON.parse(await readFile(path.join(first.workspace.out,'semantic.json'),'utf8'));
    const twice=index.symbols.find(s=>s.name==='twice');assert.ok(twice);
    assert.match(twice.signature,/value: number/);assert.equal(twice.description,'Doubles the input.');
    assert.ok(index.relations.some(r=>r.kind==='calls'&&r.to===twice.id));
    await writeFile(path.join(root,'bitmap','semantics.json'),JSON.stringify({version:1,descriptions:{[twice.id]:'Team explanation.'}}));
    await openRepository({root,noServe:true});
    server=await createAppServer(first.workspace.out,first.runtime);server.listen(0,'127.0.0.1');await once(server,'listening');
    const url=`http://127.0.0.1:${server.address().port}`;
    const result=await (await fetch(url+'/semantic')).json();
    assert.equal(result.available,true);assert.equal(result.symbols.find(s=>s.id===twice.id).descriptionSource,'curated');
    const view=await (await fetch(url+`/semantic/view?focus=${twice.id}&mode=calls`)).json();
    assert.ok(view.graph.edges.some(e=>e.to===twice.id));assert.match(view.mermaid,/flowchart/);
    assert.equal((await fetch(url+'/semantic/view?focus=unknown')).status,400);
    assert.equal((await fetch(url+'/semantic/view?mode=dataflow')).status,400);
    assert.equal((await fetch(url+'/semantic',{headers:{Origin:'https://untrusted.example'}})).status,403);
    assert.equal((await fetch(url+'/source?path=service.ts')).status,200);
    assert.equal((await fetch(url+'/source?path=.env')).status,404);
    assert.equal((await fetch(url+'/semantic.json')).status,404);
    assert.deepEqual((await readdir(root)).sort(),['.env','bitmap','service.ts']);
    assert.equal(parseArguments(['open',root,'--no-analysis']).noAnalysis,true);
  } finally {
    if(server?.listening) await new Promise(resolve=>server.close(resolve));
    for(const [i,name] of ['BITMAP_DATA_DIR','BITMAP_CACHE_DIR'].entries()) {if(saved[i]===undefined)delete process.env[name];else process.env[name]=saved[i];}
    assert.ok(path.basename(temp).startsWith('bitmap-semantic-open-'));await rm(temp,{recursive:true,force:true});
  }
});
