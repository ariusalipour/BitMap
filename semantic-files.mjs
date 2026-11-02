// Read-only, bounded discovery for the semantic index. Repository code is never executed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec = promisify(execFile);
const excluded = new Set(['node_modules','vendor','dist','build','coverage','bitmap','.git','.next','generated']);
const source = /\.(?:[cm]?[jt]sx?)$/i;
export async function discoverSemanticFiles(root, limits = {}) {
  root = await fs.realpath(root);
  const maxFiles = limits.maxFiles ?? 2000, maxBytes = limits.maxBytes ?? 30 * 1024 * 1024, maxFileBytes = limits.maxFileBytes ?? 1024 * 1024;
  const diagnostics = [], files = [];
  let names, bytes = 0, skipped = 0;
  try {
    const result = await exec('git',['-C',root,'ls-files','-z','--cached','--others','--exclude-standard','--','.'],{encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
    names = result.stdout.split('\0').filter(Boolean);
  } catch {
    diagnostics.push('Git file discovery unavailable; using bounded directory discovery.');
    names = [];
    let visited=0,capped=false;
    const walk = async (dir, prefix = '') => {
      for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
        if(++visited>100000){capped=true;return;}
        if (excluded.has(entry.name.toLowerCase()) || entry.isSymbolicLink()) continue;
        const relative = prefix + entry.name;
        if (entry.isDirectory()) await walk(path.join(dir,entry.name),relative+'/');
        else if (entry.isFile()) names.push(relative);
        if(capped)return;
      }
    };
    await walk(root);
    if(capped)diagnostics.push('Directory discovery stopped at the 100,000-entry limit; index is partial.');
  }
  for (const name of [...new Set(names)].sort()) {
    const relative = name.replaceAll('\\','/');
    if (!source.test(relative) || /\.d\.[cm]?ts$/i.test(relative) || relative.split('/').some(p=>excluded.has(p.toLowerCase()) || p==='..')) continue;
    const absolute = path.resolve(root,relative);
    try {
      const stat = await fs.lstat(absolute), real = await fs.realpath(absolute), rel = path.relative(root,real);
      if (!stat.isFile() || stat.isSymbolicLink() || rel.startsWith('..') || path.isAbsolute(rel)) { skipped++; continue; }
      if (files.length >= maxFiles || stat.size > maxFileBytes || bytes+stat.size > maxBytes) { skipped++; continue; }
      const text = await fs.readFile(absolute,'utf8');
      if (text.includes('\0')) { skipped++; continue; }
      files.push({path:relative,absolute,text,hash:createHash('sha256').update(text).digest('hex')});
      bytes += stat.size;
    } catch { skipped++; }
  }
  if (skipped) diagnostics.push(`Skipped ${skipped} unavailable, unsafe or oversized source files; limits are ${maxFiles} files, ${maxBytes} total bytes and ${maxFileBytes} bytes per file.`);
  return {root,files,diagnostics,bytes,skipped};
}
