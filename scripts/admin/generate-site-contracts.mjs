#!/usr/bin/env node
/** Materialize terminal consumer types; never import/execute backend handlers. */
import ts from '../../ConvexPress-Admin/node_modules/typescript/lib/typescript.js';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const backend=resolve(root,'ConvexPress-Admin/packages/backend/convex');
const defaultOutputs=[resolve(root,'ConvexPress-Admin/apps/web/src/test-types/convex-api-shim.d.ts'),resolve(root,'ConvexPress-Website/packages/backend/generated/api.d.ts')];
if(!process.argv.includes('--single-pass')) {
 const temp=mkdtempSync(resolve(tmpdir(),'convexpress-api-contracts-'));
 try {
  let prior;let final;let finalReport;
  for(let pass=0;pass<5;pass++) {
   const out=resolve(temp,`pass${pass}.d.ts`);
   const args=[fileURLToPath(import.meta.url),'--single-pass','--output',out,'--report',...(prior?['--seed',prior]:[])];
   const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:16*1024*1024});
   if(result.status!==0)throw new Error(result.stderr||'API contract inference failed.');
   const report=JSON.parse(result.stdout);const contents=readFileSync(out,'utf8');
   if(prior&&contents===readFileSync(prior,'utf8')){final=contents;finalReport=report;break;}
   prior=out;
  }
  if(!final)throw new Error('API contracts did not stabilize. Inspect recursive handler returns before publishing declarations.');
  const outputIndex=process.argv.indexOf('--output');const outputs=outputIndex>=0?[resolve(process.argv[outputIndex+1])]:defaultOutputs;
  for(const out of outputs){if(process.argv.includes('--check')){if(readFileSync(out,'utf8')!==final)throw new Error(`Stale site API contracts: ${out}`);}else{mkdirSync(dirname(out),{recursive:true});writeFileSync(out,final);}}
  // Ship the exact pure checkout fingerprint implementation with the standalone Website.
  if(outputIndex<0){
   const source=readFileSync(resolve(backend,'commerce/checkoutShippingGuards.ts'),'utf8');
   const out=resolve(root,'ConvexPress-Website/packages/backend/generated/checkoutShippingGuards.ts');
   const content='/* Generated from the site backend by generate-site-contracts.mjs. Do not edit. */\n'+source;
   if(process.argv.includes('--check')){if(readFileSync(out,'utf8')!==content)throw new Error('Stale checkout fingerprint contract');}
   else writeFileSync(out,content);
  }
  const reportIndex=process.argv.indexOf('--report-file');if(reportIndex>=0)writeFileSync(resolve(process.argv[reportIndex+1]),JSON.stringify(finalReport,null,2)+'\n');
  console.log(`Site API contracts ${process.argv.includes('--check')?'verified':'generated'}: ${finalReport.functions} functions, ${finalReport.dtoTypes} terminal DTOs; ${finalReport.untypedBoundaries.length} existing unknown boundaries.`);
 } finally {rmSync(temp,{recursive:true,force:true});}
 process.exit(0);
}

const config=ts.readConfigFile(resolve(backend,'tsconfig.json'),ts.sys.readFile);
if(config.error)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,' '));
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,backend);
const host=ts.createCompilerHost(parsed.options);
const originalRead=host.readFile.bind(host);
const seedIndex=process.argv.indexOf('--seed');
// Generation-only bootstrap breaks the backend's recursive fullApi graph. Never emitted.
const seed=seedIndex>=0?readFileSync(resolve(process.argv[seedIndex+1]),'utf8'):'import type { AnyApi, AnyComponents } from "convex/server"; export declare const api: AnyApi; export declare const internal: AnyApi; export declare const components: AnyComponents;';
host.readFile=file=>file===resolve(backend,'_generated/api.d.ts')?seed:originalRead(file);
const program=ts.createProgram(parsed.fileNames,parsed.options,host); const checker=program.getTypeChecker();
const unresolved=[]; const names=new Map(); const definitions=[]; const publicTree={};const internalTree={};let current='';let currentSource;
const F=ts.TypeFlags;
// Recursive unions can refer to themselves through arrays before reaching an
// object. Allocate a terminal alias only when that recursion actually occurs.
const compounds=new Map();
function materializeCompound(type,render) {
 const prior=compounds.get(type);
 if(prior){
  if(prior.slot===undefined){prior.slot=definitions.length;prior.name=`Dto${prior.slot}`;definitions.push('');names.set(type,prior.name);}
  return prior.name;
 }
 const frame={};compounds.set(type,frame);
 let value;
 try{value=render();}finally{compounds.delete(type);}
 if(frame.slot!==undefined){definitions[frame.slot]=`export type ${frame.name} = ${value};`;return frame.name;}
 return value;
}
function materialize(type) {
 if(type.flags & F.Any){unresolved.push(current);return 'unknown';}
 if(type.flags & F.Unknown)return 'unknown';
 if(type.flags & F.Never)return 'never';
 if(type.flags & F.TemplateLiteral){
  const literal=text=>text.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${');
  return '`'+type.texts.map((text,index)=>literal(text)+(index<type.types.length?'${'+materialize(type.types[index])+'}':'')).join('')+'`';
 }
 if(type.flags & F.StringLike)return type.isStringLiteral()?JSON.stringify(type.value):'string';
 if(type.flags & F.NumberLike)return type.isNumberLiteral()?String(type.value):'number';
 if(type.flags & F.BooleanLike)return type.flags&F.BooleanLiteral?type.intrinsicName:'boolean';
 if(type.flags & F.BigIntLike)return 'bigint';
 if(type.flags & F.Null)return 'null';
 if(type.flags & (F.Undefined|F.Void))return 'undefined';
 if(type.aliasSymbol?.name==='Id' && type.aliasTypeArguments?.length===1)return `GenericId<${materialize(type.aliasTypeArguments[0])}>`;
 if(names.has(type))return names.get(type);
 if(type.isUnionOrIntersection())return materializeCompound(type,()=> '('+type.types.map(t=>materialize(t)).join(type.isUnion()?' | ':' & ')+')');
 if(checker.isArrayType(type))return materializeCompound(type,()=> `Array<${materialize(checker.getTypeArguments(type)[0])}>`);
 if(checker.isTupleType(type))return materializeCompound(type,()=> '['+checker.getTypeArguments(type).map(t=>materialize(t)).join(', ')+']');
 if(type.getSymbol()?.name==='ArrayBuffer')return 'ArrayBuffer';
 const name=`Dto${definitions.length}`; const slot=definitions.length;definitions.push('');names.set(type,name);
 const props=checker.getPropertiesOfType(type).map(symbol=>{
  const declaration=symbol.valueDeclaration??symbol.declarations?.[0]??currentSource;
  const value=checker.getTypeOfSymbolAtLocation(symbol,declaration);
  return `${JSON.stringify(symbol.name)}${symbol.flags&ts.SymbolFlags.Optional?'?':''}: ${materialize(value)};`;
 });
 const indexes=checker.getIndexInfosOfType(type).map(index=>`[key: ${materialize(index.keyType)}]: ${materialize(index.type)};`);
 if(type.getCallSignatures().length)throw new Error(`Nonserializable callable result: ${current}`);
 definitions[slot]=`export type ${name} = { ${[...props,...indexes].join(' ')} };`;
 return name;
}
function propertyType(type,name) {
 const property=checker.getPropertyOfType(type,name);
 return property?checker.getTypeOfSymbolAtLocation(property,property.valueDeclaration??property.declarations?.[0]??currentSource):undefined;
}
function declaredValidators(symbol) {
 const initializer=symbol.valueDeclaration?.initializer;
 if(!initializer||!ts.isCallExpression(initializer)||!initializer.arguments[0])return {};
 const config=checker.getTypeAtLocation(initializer.arguments[0]);
 return {args:propertyType(config,'args'),returns:propertyType(config,'returns')};
}
function argumentContract(validator,fallback) {
 if(!validator)return materialize(fallback)==='unknown'?'Record<string, unknown>':materialize(fallback);
 if(validator.flags&(F.Any|F.Unknown))throw new Error(`Untyped argument validator: ${current}`);
 if(propertyType(validator,'isConvexValidator')) {
  const value=propertyType(validator,'type');if(!value)throw new Error(`Invalid object validator: ${current}`);
  const result=materialize(value);return result==='unknown'?'Record<string, unknown>':result;
 }
 return '{ '+checker.getPropertiesOfType(validator).map(field=>{
  const fieldValidator=checker.getTypeOfSymbolAtLocation(field,field.valueDeclaration??field.declarations?.[0]??currentSource);
  const value=propertyType(fieldValidator,'type');if(!value)throw new Error(`Invalid argument validator ${current}.${field.name}`);
  const optional=checker.typeToString(propertyType(fieldValidator,'isOptional'))==='"optional"';
  return `${JSON.stringify(field.name)}${optional?'?':''}: ${materialize(value)};`;
 }).join(' ')+' }';
}
function add(tree,module,name,ref){let node=tree;for(const part of module.split('/'))node=node[part]??={};if(node[name])throw new Error(`Duplicate API path ${module}:${name}`);node[name]=ref;if(module.includes("/"))tree[module]=node;}
const signatures=[];
for(const file of parsed.fileNames.sort()) {
 const source=program.getSourceFile(file);currentSource=source;if(!source||source.isDeclarationFile)continue;
 const module=relative(backend,file).replaceAll('\\','/').replace(/\.tsx?$/,'');if(module.startsWith('_generated/')||module.includes('__tests__'))continue;
 const moduleSymbol=checker.getSymbolAtLocation(source);if(!moduleSymbol)continue;
 for(const exported of checker.getExportsOfModule(moduleSymbol).sort((a,b)=>a.name.localeCompare(b.name))) {
  const symbol=exported.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(exported):exported;
  const type=checker.getTypeOfSymbolAtLocation(symbol,symbol.valueDeclaration??source);
  const kind={RegisteredQuery:'query',RegisteredMutation:'mutation',RegisteredAction:'action'}[type.aliasSymbol?.name];if(!kind)continue;
  const [visibility,args,returns]=type.aliasTypeArguments??[];if(!visibility||!args||!returns)throw new Error(`Unresolved registered signature ${module}:${exported.name}`);
  const vis=checker.typeToString(visibility).replaceAll('"','');if(!['public','internal'].includes(vis))throw new Error(`Invalid visibility ${module}:${exported.name}`);
  const validators=declaredValidators(symbol);
  current=`${module}:${exported.name}:args`;const argText=argumentContract(validators.args,args);current=`${module}:${exported.name}:returns`;const validatedReturn=validators.returns&&propertyType(validators.returns,'type');const effectiveReturn=validatedReturn&&!(validatedReturn.flags&F.Any)?validatedReturn:checker.getAwaitedType(returns);const retText=materialize(effectiveReturn);
  const ref=`FunctionReference<${JSON.stringify(kind)}, ${JSON.stringify(vis)}, ${argText}, ${retText==='undefined'?'null':retText}>`;
  add(vis==='public'?publicTree:internalTree,module,exported.name,ref);signatures.push({path:`${module}:${exported.name}`,kind,visibility:vis});
 }
}
function tree(node){return '{\n'+Object.entries(node).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`  ${JSON.stringify(key)}: ${typeof value==='string'?value:tree(value)};`).join('\n')+'\n}';}
const text='/* Generated by scripts/admin/generate-site-contracts.mjs. Do not edit. */\nimport type { FunctionReference } from "convex/server";\nimport type { GenericId } from "convex/values";\n'+definitions.join('\n')+'\nexport type PublicApi = '+tree(publicTree)+';\nexport type InternalApi = '+tree(internalTree)+';\nexport declare const api: PublicApi;\nexport declare const internal: InternalApi;\nexport declare const components: {};\n';
const output=process.argv.indexOf('--output');
const outputs=output>=0?[resolve(process.argv[output+1])]:[
 resolve(root,'ConvexPress-Admin/apps/web/src/test-types/convex-api-shim.d.ts'),
 resolve(root,'ConvexPress-Website/packages/backend/generated/api.d.ts'),
];
for(const file of outputs){if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==text)throw new Error(`Stale site API contracts: ${file}`);}else {mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text);}}
const report={functions:signatures.length,public:signatures.filter(x=>x.visibility==='public').length,internal:signatures.filter(x=>x.visibility==='internal').length,dtoTypes:definitions.length,bytes:text.length,untypedBoundaries:[...new Set(unresolved)].sort()};
if(process.argv.includes('--report'))console.log(JSON.stringify(report,null,2));else console.log(`Site API contracts: ${report.functions} functions, ${report.dtoTypes} terminal DTOs, ${report.untypedBoundaries.length} existing untyped boundaries.`);
