import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {analyzeRepository} from './semantic-analysis.mjs';
async function fixture(t,files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bitmap-semantics-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const [name,text] of Object.entries(files)){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
  return root;
}
test('extracts documented declarations and resolves local aliases, calls and inheritance',async t=>{
  const root=await fixture(t,{
    'model.ts':'export interface Contract { run(value: string): number; }\n/** Counts input characters. */\nexport function count(value: string): number { return value.length; }\nexport class Base {}',
    'app.ts':"import {count as measure, Base, Contract} from './model';\nexport class Runner extends Base implements Contract { run(value: string): number { return measure(value); } }\nexport function dynamic(value: any) { value.unknown(); }",
  });
  const before=await fs.readdir(root),index=await analyzeRepository(root);
  const symbol=name=>index.symbols.find(item=>item.name===name);
  assert.equal(index.files.length,2);
  assert.equal(symbol('count').description,'Counts input characters.');
  assert.equal(symbol('count').descriptionSource,'jsdoc');
  assert.deepEqual(symbol('count').parameters,[{name:'value',type:'string'}]);
  assert.equal(symbol('count').returnType,'number');
  assert.equal(symbol('count').exported,true);
  const run=index.symbols.find(item=>item.name==='run'&&item.parentId===symbol('Runner').id);
  assert.ok(index.relations.some(edge=>edge.from===run.id&&edge.to===symbol('count').id&&edge.kind==='calls'));
  assert.ok(index.relations.some(edge=>edge.from===symbol('Runner').id&&edge.to===symbol('Base').id&&edge.kind==='extends'));
  assert.ok(index.relations.some(edge=>edge.from===symbol('Runner').id&&edge.to===symbol('Contract').id&&edge.kind==='implements'));
  assert.ok(index.relations.some(edge=>edge.kind==='imports'));
  assert.ok(!index.relations.some(edge=>edge.from===symbol('dynamic').id&&edge.kind==='calls'));
  assert.deepEqual(await fs.readdir(root),before);
  await fs.writeFile(path.join(root,'model.ts'),'\n\n'+await fs.readFile(path.join(root,'model.ts'),'utf8'));
  const updated=await analyzeRepository(root);
  assert.equal(updated.symbols.find(item=>item.name==='count').id,symbol('count').id);
  assert.equal(updated.symbols.find(item=>item.name==='count').range.startLine,symbol('count').range.startLine+2);
});
test('recognizes JSX components, hooks and resolved render relationships',async t=>{
  const root=await fixture(t,{'page.tsx':'export function Child() { return <div/>; }\nexport const Page = () => <Child/>;\nexport function useValue(): string { return "value"; }'});
  const index=await analyzeRepository(root),page=index.symbols.find(item=>item.name==='Page'),child=index.symbols.find(item=>item.name==='Child');
  assert.equal(page.kind,'component');assert.equal(child.kind,'component');
  assert.equal(index.symbols.find(item=>item.name==='useValue').kind,'hook');
  assert.ok(index.relations.some(edge=>edge.from===page.id&&edge.to===child.id&&edge.kind==='renders'));
});
test('retains anonymous default component exports',async t=>{
  const root=await fixture(t,{'page.tsx':'export default function () { return <main/>; }'});
  const index=await analyzeRepository(root),component=index.symbols.find(item=>item.name==='default');
  assert.equal(component.kind,'component');assert.equal(component.exported,true);
});
test('class, interface and enum signatures contain declarations rather than member bodies',async t=>{
  const root=await fixture(t,{'model.ts':'export class Base {}\nexport interface Contract { run(): void; }\nexport class Runner<T extends string> extends Base implements Contract { run() { console.log("private implementation"); } }\nexport enum State { Active = "active implementation" }'});
  const index=await analyzeRepository(root),symbol=name=>index.symbols.find(item=>item.name===name);
  assert.equal(symbol('Runner').signature,'class Runner<T extends string> extends Base implements Contract');
  assert.equal(symbol('Contract').signature,'interface Contract');
  assert.equal(symbol('State').signature,'enum State');
  assert.ok(!symbol('Runner').signature.includes('implementation'));
});
test('excludes build, authored bitmap and declaration files and reports resource limits',async t=>{
  const root=await fixture(t,{'src/a.ts':'export class A {}','dist/b.ts':'export class B {}','bitmap/c.ts':'export class C {}','src/types.d.ts':'declare class D {}','src/large.ts':'x'.repeat(300)});
  const index=await analyzeRepository(root,{maxFileBytes:100});
  assert.deepEqual(index.files.map(file=>file.path),['src/a.ts']);
  assert.equal(index.stats.skipped,1);assert.ok(index.diagnostics.some(text=>text.includes('Skipped')));
});
test('resolves local tsconfig aliases without loading configuration plugins or outside files',async t=>{
  const root=await fixture(t,{'tsconfig.json':JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@/*':['src/*']},plugins:[{name:'never-execute'}]}}),'src/value.ts':'export function value() { return 1; }','src/main.ts':"import {value} from '@/value'; export function main() { return value(); }"});
  const index=await analyzeRepository(root),main=index.symbols.find(item=>item.name==='main'),value=index.symbols.find(item=>item.name==='value');
  assert.ok(index.relations.some(edge=>edge.kind==='calls'&&edge.from===main.id&&edge.to===value.id));
});
test('ignores symlinks to source outside the repository',async t=>{
  const root=await fixture(t,{'inside.ts':'export const inside=1;'}),outside=await fixture(t,{'outside.ts':'export class Outside {}'});
  try{await fs.symlink(path.join(outside,'outside.ts'),path.join(root,'linked.ts'));}catch(error){if(error.code==='EPERM'){t.skip('Symlink privileges unavailable');return;}throw error;}
  const index=await analyzeRepository(root);assert.deepEqual(index.files.map(file=>file.path),['inside.ts']);
});
