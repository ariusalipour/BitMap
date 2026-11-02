import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import { build } from 'esbuild';
const result=await build({entryPoints:[fileURLToPath(new URL('./semantic-explorer.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser'});
const {filterSymbols,symbolTrail,scopedSymbols}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
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
