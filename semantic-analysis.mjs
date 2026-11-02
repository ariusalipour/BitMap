// Static TypeScript compiler analysis; this module does not run repository code or emit files.
import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {discoverSemanticFiles} from './semantic-files.mjs';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,24);
const normalized = value => { const result=path.resolve(value).replaceAll('\\','/');return process.platform==='win32'?result.toLowerCase():result; };
export async function analyzeRepository(root, limits) {
  const discovery = await discoverSemanticFiles(root,limits);
  const byAbsolute = new Map(discovery.files.map(file=>[normalized(file.absolute),file]));
  const directories=new Set();
  for(const file of discovery.files) {let directory=path.dirname(file.absolute);while(!directories.has(normalized(directory))){directories.add(normalized(directory));const parent=path.dirname(directory);if(parent===directory)break;directory=parent;}}
  const options = {allowJs:true,checkJs:false,noLib:true,noResolve:false,noEmit:true,jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.Latest,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true};
  const host = ts.createCompilerHost(options);
  host.fileExists = file => byAbsolute.has(normalized(file));
  host.readFile = file => byAbsolute.get(normalized(file))?.text;
  host.getSourceFile = (file,languageVersion) => {const text=host.readFile(file); return text===undefined ? undefined : ts.createSourceFile(file,text,languageVersion,true);};
  host.directoryExists = directory => directories.has(normalized(directory));
  host.getDirectories = () => [];
  host.writeFile = () => {throw new Error('Semantic analysis cannot write files.');};
  // Read only the local JSON configuration, never load plugins or execute/extend configuration.
  let aliases={},aliasBase=discovery.root;
  try {
    const configPath=path.join(discovery.root,'tsconfig.json'),real=await fs.realpath(configPath);
    if(path.relative(discovery.root,real).startsWith('..')) throw new Error('Configuration outside repository');
    const stat=await fs.stat(real);if(stat.size>1024*1024)throw new Error('Configuration exceeds size limit');
    const parsed=ts.parseConfigFileTextToJson(configPath,await fs.readFile(real,'utf8'));
    if(parsed.error)discovery.diagnostics.push('Local tsconfig.json could not be parsed; path aliases were not loaded.');
    else {
      aliases=parsed.config?.compilerOptions?.paths??{};
      const configuredBase=parsed.config?.compilerOptions?.baseUrl;
      if(typeof configuredBase==='string')aliasBase=path.resolve(discovery.root,configuredBase);
      if(parsed.config?.extends)discovery.diagnostics.push('Extended tsconfig configuration is not loaded; only local path aliases are considered.');
    }
  } catch(error) {if(error.code!=='ENOENT')discovery.diagnostics.push('Local tsconfig.json aliases unavailable: '+error.message);}
  host.resolveModuleNames=(names,containingFile)=>names.map(name=>{
    for(const [pattern,targets] of Object.entries(aliases)) {
      if(!Array.isArray(targets))continue;
      const star=pattern.indexOf('*'),prefix=star<0?pattern:pattern.slice(0,star),suffix=star<0?'':pattern.slice(star+1);
      if(star<0?name!==pattern:!name.startsWith(prefix)||!name.endsWith(suffix))continue;
      const replacement=star<0?'':name.slice(prefix.length,name.length-suffix.length);
      for(const target of targets) {
        if(typeof target!=='string')continue;
        const absolute=path.resolve(aliasBase,target.replace('*',replacement));
        for(const candidate of [absolute,...['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','/index.ts','/index.tsx','/index.js','/index.jsx'].map(extension=>absolute+extension)]) {
          const file=byAbsolute.get(normalized(candidate));
          if(file)return {resolvedFileName:file.absolute,extension:ts.extensionFromPath(file.absolute),isExternalLibraryImport:false};
        }
      }
    }
    return ts.resolveModuleName(name,containingFile,options,host).resolvedModule;
  });
  const program = ts.createProgram(discovery.files.map(file=>file.absolute),options,host), checker=program.getTypeChecker();
  const symbols=[],relations=[],nodeIds=new Map(),declarationIds=new Map(),modules=new Map(),seenRelations=new Set(),symbolIds=new Set();
  const sourceFiles=program.getSourceFiles().filter(file=>byAbsolute.has(normalized(file.fileName)));
  function location(node,file) {
    const start=file.getLineAndCharacterOfPosition(node.getStart(file)),end=file.getLineAndCharacterOfPosition(node.end);
    return {startLine:start.line+1,endLine:end.line+1,startColumn:start.character+1,endColumn:end.character+1};
  }
  function relation(from,to,kind,node,file,confidence='resolved') {
    if (!from || !to || (from===to && kind!=='calls')) return;
    const line=file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,key=[from,to,kind,line].join('|');
    if (seenRelations.has(key)) return; seenRelations.add(key);
    relations.push({from,to,kind,path:byAbsolute.get(normalized(file.fileName)).path,line,confidence});
  }
  function kindOf(node) {
    if (ts.isClassDeclaration(node)||ts.isClassExpression(node)) return 'class';
    if (ts.isInterfaceDeclaration(node)) return 'interface';
    if (ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)) return 'function';
    if (ts.isMethodDeclaration(node)||ts.isMethodSignature(node)||ts.isConstructorDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node)) return 'method';
    if (ts.isPropertyDeclaration(node)||ts.isPropertySignature(node)) return 'property';
    if (ts.isTypeAliasDeclaration(node)) return 'type';
    if (ts.isEnumDeclaration(node)) return 'enum';
    return null;
  }
  function add(node,file,parentId,qualified,name,kind) {
    const relative=byAbsolute.get(normalized(file.fileName)).path,id='s_'+hash(relative+'|'+qualified+'|'+kind);
    if (symbolIds.has(id)) {nodeIds.set(node,id);declarationIds.set(node,id);return id;}symbolIds.add(id);
    let compilerSymbol=node.name ? checker.getSymbolAtLocation(node.name) : undefined;
    if (!compilerSymbol && ts.isVariableDeclaration(node.parent)) compilerSymbol=checker.getSymbolAtLocation(node.parent.name);
    const description=compilerSymbol ? ts.displayPartsToString(compilerSymbol.getDocumentationComment(checker)) : '';
    const modifiers=(ts.getModifiers(node)??[]).map(modifier=>ts.tokenToString(modifier.kind)).filter(Boolean);
    const declaration=ts.isVariableDeclaration(node.parent) ? node.parent.parent.parent : node;
    const exported=Boolean((ts.getCombinedModifierFlags(declaration)&ts.ModifierFlags.Export) || (ts.getCombinedModifierFlags(declaration)&ts.ModifierFlags.Default));
    let signature=node.getText(file).split(/[\r\n]/)[0].slice(0,500), parameters=[],returnType=null;
    if(kind==='class'||kind==='interface'||kind==='enum') {
      const typeParameters=node.typeParameters?.length?'<'+node.typeParameters.map(parameter=>parameter.getText(file)).join(', ')+'>':'';
      const heritage=node.heritageClauses?.length?' '+node.heritageClauses.map(clause=>clause.getText(file)).join(' '):'';
      signature=`${kind} ${name}${typeParameters}${heritage}`;
    }
    if (ts.isFunctionLike(node)) {
      const sig=checker.getSignatureFromDeclaration(node);
      if(sig) {signature=checker.signatureToString(sig,node,ts.TypeFormatFlags.NoTruncation);returnType=checker.typeToString(checker.getReturnTypeOfSignature(sig));}
      parameters=(node.parameters??[]).map(parameter=>({name:parameter.name.getText(file),type:parameter.type?.getText(file)??checker.typeToString(checker.getTypeAtLocation(parameter))}));
    } else if (kind==='property'||kind==='type') signature=`${name}: ${checker.typeToString(checker.getTypeAtLocation(node),node,ts.TypeFormatFlags.NoTruncation)}`;
    if(kind==='function' && /^use[A-Z]/.test(name)) kind='hook';
    else if(kind==='function' && (/^[A-Z]/.test(name)||name==='default')) {let jsx=false;const scan=n=>{if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)||ts.isJsxFragment(n))jsx=true;else ts.forEachChild(n,scan);};scan(node);if(jsx)kind='component';}
    symbols.push({id,path:relative,name,kind,parentId,range:location(node,file),signature:signature.slice(0,2000),description:description?description.slice(0,12000):null,descriptionSource:description?'jsdoc':'none',exported,modifiers,parameters:parameters.map(parameter=>({...parameter,type:parameter.type.slice(0,1000)})),returnType:returnType?.slice(0,2000)??null});
    nodeIds.set(node,id);declarationIds.set(node,id);
    if(ts.isVariableDeclaration(node.parent)) declarationIds.set(node.parent,id);
    relation(parentId,id,'contains',node,file);
    return id;
  }
  for(const file of sourceFiles) {
    const relative=byAbsolute.get(normalized(file.fileName)).path,id='s_'+hash(relative+'|module');modules.set(normalized(file.fileName),id);nodeIds.set(file,id);declarationIds.set(file,id);
    symbols.push({id,path:relative,name:path.posix.basename(relative),kind:'module',parentId:null,range:location(file,file),signature:relative,description:null,descriptionSource:'none',exported:false,modifiers:[],parameters:[],returnType:null});
    const visit=(node,parentId,qualified)=>{
      let kind=kindOf(node),name=node.name?.getText(file);
      if(kind&&!name&&((ts.getCombinedModifierFlags(node)&ts.ModifierFlags.Default)||ts.isExportAssignment(node.parent)))name='default';
      if((ts.isArrowFunction(node)||ts.isFunctionExpression(node))&&ts.isVariableDeclaration(node.parent))name=node.parent.name.getText(file);
      if(ts.isConstructorDeclaration(node))name='constructor';
      if(kind && name) {const full=qualified?qualified+'.'+name:name; parentId=add(node,file,parentId,full,name,kind);qualified=full;}
      ts.forEachChild(node,child=>visit(child,parentId,qualified));
    };
    ts.forEachChild(file,node=>visit(node,id,''));
  }
  function resolve(node) {
    let symbol=checker.getSymbolAtLocation(node);
    if(symbol?.flags & ts.SymbolFlags.Alias) {try{symbol=checker.getAliasedSymbol(symbol);}catch{return null;}}
    for(const declaration of symbol?.declarations??[]) {const id=declarationIds.get(declaration);if(id)return id;}
    return null;
  }
  for(const file of sourceFiles) {
    const moduleId=modules.get(normalized(file.fileName));
    const visit=(node,owner)=>{
      owner=nodeIds.get(node)??owner;
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const symbol=checker.getSymbolAtLocation(node.moduleSpecifier),target=symbol?.declarations?.find(ts.isSourceFile);
        relation(moduleId,target&&modules.get(normalized(target.fileName)),'imports',node,file);
      }
      if(ts.isCallExpression(node)||ts.isNewExpression(node))relation(owner,resolve(ts.isPropertyAccessExpression(node.expression)?node.expression.name:node.expression),'calls',node,file);
      if(ts.isHeritageClause(node))for(const type of node.types)relation(owner,resolve(type.expression),node.token===ts.SyntaxKind.ExtendsKeyword?'extends':'implements',type,file);
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))relation(owner,resolve(node.tagName),'renders',node,file);
      ts.forEachChild(node,child=>visit(child,owner));
    }; visit(file,moduleId);
  }
  return {version:1,generatedAt:new Date().toISOString(),files:discovery.files.map(file=>({path:file.path,id:modules.get(normalized(file.absolute)),hash:file.hash})),symbols,relations,diagnostics:[...discovery.diagnostics,'Component and hook roles use JSX and naming conventions; call relationships include only locally resolved declarations. Dynamic calls, external packages, navigation and value-level data flow are not inferred.'],stats:{files:discovery.files.length,symbols:symbols.length,relations:relations.length,bytes:discovery.bytes,skipped:discovery.skipped}};
}
