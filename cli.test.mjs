// Exercise the opener's public arguments and separation of private data from assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, readdir, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { parseArguments, openRepository } from './cli.mjs';
import { createAppServer } from './server.mjs';

test('opener validates command, duplicate flags and port before doing work', () => {
  assert.deepEqual(parseArguments(['open', '/repo', '--port', '4320', '--no-serve']), {root:'/repo',port:4320,noServe:true});
  for (const args of [[], ['open'], ['scan','/repo'], ['open','/repo','--port','0'], ['open','/repo','--port','NaN'], ['open','/repo','--graph'], ['open','/repo','--title','a','--title','b']]) assert.throws(() => parseArguments(args));
});

test('opener compiles saved inputs and rejects invalid replacements without losing them', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'bitmap-open-'));
  const previous = [process.env.BITMAP_DATA_DIR, process.env.BITMAP_CACHE_DIR];
  process.env.BITMAP_DATA_DIR = path.join(temp,'data');
  process.env.BITMAP_CACHE_DIR = path.join(temp,'cache');
  try {
    const root = path.join(temp,'repo'), graph = path.join(temp,'input.json');
    await mkdir(root);
    await writeFile(graph,JSON.stringify({groups:[],nodes:[{id:'app',label:'App',type:'Module',description:null,groupId:null,path:null,shape:'box'}],edges:[]}));
    const first = await openRepository({root,graph,noServe:true});
    assert.equal(first.workspace.graph,path.join(await realpath(root),'bitmap','graph.json'));
    assert.deepEqual(await readdir(root),['bitmap']);
    assert.deepEqual((await readdir(path.join(root,'bitmap'))).sort(),['config.json','graph.json']);
    assert.equal(Object.hasOwn(JSON.parse(await readFile(path.join(root,'bitmap','config.json'),'utf8')),'root'),false);
    const saved = await readFile(first.workspace.graph,'utf8');
    assert.equal(JSON.parse(await readFile(path.join(first.workspace.out,'diagram.json'),'utf8')).graph.nodes[0].id,'app');
    await writeFile(graph,'{}');
    await assert.rejects(openRepository({root,graph,noServe:true}));
    assert.equal(await readFile(first.workspace.graph,'utf8'),saved);
    const reopened = await openRepository({root,noServe:true});
    assert.equal(reopened.workspace.id,first.workspace.id);
    const clone = path.join(temp,'clone');
    await mkdir(clone);
    await cp(path.join(root,'bitmap'),path.join(clone,'bitmap'),{recursive:true});
    const portable = await openRepository({root:clone,noServe:true});
    assert.notEqual(portable.workspace.id,first.workspace.id);
    assert.equal(JSON.parse(await readFile(path.join(portable.workspace.out,'diagram.json'),'utf8')).graph.nodes[0].id,'app');
  } finally {
    for (const [i,key] of ['BITMAP_DATA_DIR','BITMAP_CACHE_DIR'].entries()) {
      if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
    }
    await rm(temp,{recursive:true,force:true});
  }
});

test('shared server exposes only named snapshot exports and public runtime assets', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'bitmap-server-'));
  let server;
  try {
    const out = path.join(temp,'cache'), runtime = path.join(temp,'runtime'), root = path.join(temp,'repo');
    await Promise.all([mkdir(out),mkdir(runtime),mkdir(root)]);
    await writeFile(path.join(out,'diagram.json'),JSON.stringify({root,title:'Fixture',graph:{nodes:[],edges:[]},views:[{id:'all'}]}));
    await writeFile(path.join(out,'all.mmd'),'flowchart TD');
    await writeFile(path.join(out,'config.json'),'private');
    await writeFile(path.join(runtime,'index.html'),'shared viewer');
    await writeFile(path.join(runtime,'compiler.mjs'),'private compiler');
    await writeFile(path.join(runtime,'runtime-manifest.json'),'internal');
    server = await createAppServer(out,runtime);
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal(await (await fetch(url)).text(),'shared viewer');
    assert.equal(await (await fetch(url+'/all.mmd')).text(),'flowchart TD');
    for (const name of ['config.json','compiler.mjs','runtime-manifest.json']) assert.equal((await fetch(url+'/'+name)).status,404);
    assert.equal(JSON.parse(await readFile(path.join(out,'diagram.json'),'utf8')).title,'Fixture');
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(temp,{recursive:true,force:true});
  }
});
