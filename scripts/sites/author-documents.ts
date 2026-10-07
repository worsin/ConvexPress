import { createHash } from 'node:crypto';
import { validateCanonicalTree } from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/instances';

export type Target = {origin:string;websiteKey:string;instanceKey:string;environmentKind:string};
export type DocumentRecipe = {key:string;type:'page'|'post';title:string;slug:string;blocks:unknown[]};
export type Recipe = {id:string;documents:DocumentRecipe[]};
export type Row = {id:string;type:string;title:string;slug:string;revision:number;blocks:unknown[];status:string};
type Receipt = {postId:string;revision:number};
type Owned = {id:string;revision:number;phase:'created'|'routed'|'authored'};
type Operation = {key:string;name:string;args:Record<string,unknown>;state:'pending'|'acknowledged';result?:Receipt};
export type Journal = {version:1;target?:Target;recipeDigest?:string;operations:Operation[];documents:Record<string,Owned>};
export type AuthoringApi = {
 identity():Promise<Target>;find(type:'page'|'post',slug:string):Promise<{id:string}|null>;
 read(id:string):Promise<Row|null>;mutate(name:string,args:Record<string,unknown>):Promise<Receipt>;
};
function stable(value:unknown):string {
 if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
 if(value && typeof value==='object') return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
 const encoded=JSON.stringify(value);
 if(encoded===undefined)throw Error('UNENCODABLE_RECEIPT_VALUE');
 return encoded;
}
const same=(a:unknown,b:unknown)=>stable(a)===stable(b);
function refuse(code:string):never {throw new Error(code);}
function validateRecipe(recipe:Recipe) {
 if(!recipe.id || !Array.isArray(recipe.documents) || !recipe.documents.length || recipe.documents.length>40) refuse('INVALID_RECIPE');
 const keys=new Set(),routes=new Set();
 for(const doc of recipe.documents){
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(doc.key) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.slug) || doc.slug.length>120 || !['page','post'].includes(doc.type) || !doc.title.trim() || doc.title.length>512) refuse('INVALID_RECIPE');
  const route=(doc.type==='post'?'/blog/':'/')+doc.slug;
  if(keys.has(doc.key)||routes.has(route)) refuse('DUPLICATE_RECIPE_ROUTE');keys.add(doc.key);routes.add(route);
  validateCanonicalTree(doc.blocks);
 }
}
/** Authors only drafts. Site settings, navigation, resource provisioning and
 * publication have independent acceptance stages and never hide behind this result. */
export async function authorDocuments({recipe,target,api,journal,persist}:{recipe:Recipe;target:Target;api:AuthoringApi;journal:Journal;persist:(value:Journal)=>Promise<void>}) {
 validateRecipe(recipe);
 const origin=new URL(target.origin);
 if(origin.origin!==target.origin || origin.username || origin.password || !['http:','https:'].includes(origin.protocol) || !target.websiteKey || !target.instanceKey || target.environmentKind!=='staging') refuse('STAGING_TARGET_REQUIRED');
 if(!same(await api.identity(),target)) refuse('TARGET_IDENTITY_MISMATCH');
 const digest=createHash('sha256').update(stable(recipe)).digest('hex');
 if(journal.version!==1 || !Array.isArray(journal.operations) || !journal.documents) refuse('INVALID_RECEIPT');
 const ownedIds=new Set<string>();
 for(const owned of Object.values(journal.documents)){
  if(!owned || typeof owned.id!=='string' || !owned.id || !Number.isSafeInteger(owned.revision) || owned.revision<1 || !['created','routed','authored'].includes(owned.phase) || ownedIds.has(owned.id)) refuse('INVALID_RECEIPT');
  ownedIds.add(owned.id);
 }
 if(journal.recipeDigest!==undefined && (journal.recipeDigest!==digest || !same(journal.target,target))) refuse('RECEIPT_MISMATCH');
 if(journal.operations.some(op=>op.state!=='acknowledged')) refuse('UNCONFIRMED_WRITE');
 if(journal.recipeDigest===undefined && (journal.operations.length || Object.keys(journal.documents).length)) refuse('INVALID_RECEIPT');
 if(Object.keys(journal.documents).some(key=>!recipe.documents.some(doc=>doc.key===key))) refuse('RECEIPT_MISMATCH');
 // Check the whole recipe before the first mutation; pre-existing records are
 // never adopted merely because their title or slug matches an example.
 for(const doc of recipe.documents){
  const found=await api.find(doc.type,doc.slug),owned=journal.documents[doc.key];
  if(found && found.id!==owned?.id) refuse('ROUTE_OCCUPIED: '+doc.slug);
  if(owned) await checkOwned(doc,owned);
 }
 journal.target={...target};journal.recipeDigest=digest;await persist(journal);
 async function checkOwned(doc:DocumentRecipe,owned:Owned) {
  const row=await api.read(owned.id);
  if(!row || row.id!==owned.id || row.revision!==owned.revision || row.type!==doc.type || row.title!==doc.title || row.status!=='draft') refuse('OWNED_DOCUMENT_CHANGED: '+doc.key);
  const expected=owned.phase==='authored'?doc.blocks:[];
  if(!same(validateCanonicalTree(row.blocks),validateCanonicalTree(expected)) || (owned.phase!=='created' && row.slug!==doc.slug)) refuse('OWNED_DOCUMENT_CHANGED: '+doc.key);
  return row;
 }
 async function write(doc:DocumentRecipe,name:string,args:Record<string,unknown>,phase:Owned['phase']) {
  if(!same(await api.identity(),target)) refuse('TARGET_IDENTITY_MISMATCH');
  // Persist intent before crossing the mutation boundary. Any thrown mutation
  // stays pending; no retry assumes a transport failure meant no write.
  const op:Operation={key:doc.key,name,args,state:'pending'};journal.operations.push(op);await persist(journal);
  const receipt=await api.mutate(name,args);
  if(!receipt || typeof receipt.postId!=='string' || !receipt.postId || !Number.isSafeInteger(receipt.revision) || receipt.revision<1 || (args.postId!==undefined && receipt.postId!==args.postId)) refuse('INVALID_WRITE_RECEIPT');
  journal.documents[doc.key]={id:receipt.postId,revision:receipt.revision,phase};
  op.result=receipt;op.state='acknowledged';
  try{await persist(journal);}catch(error){op.state='pending';throw error;}
 }
 for(const doc of recipe.documents){
  if(!journal.documents[doc.key]) await write(doc,'canonicalDocuments:create',{type:doc.type,title:doc.title},'created');
  let owned=journal.documents[doc.key];await checkOwned(doc,owned);
  if(owned.phase==='created') {
   const collision=await api.find(doc.type,doc.slug);if(collision && collision.id!==owned.id) refuse('ROUTE_OCCUPIED: '+doc.slug);
   await write(doc,'canonicalDocuments:updateMetadata',{postId:owned.id,expectedRevision:owned.revision,slug:doc.slug},'routed');
   owned=journal.documents[doc.key];await checkOwned(doc,owned);
  }
  if(owned.phase==='routed'){
   await write(doc,'canonicalDocuments:save',{postId:owned.id,expectedRevision:owned.revision,title:doc.title,blocks:doc.blocks},'authored');
   await checkOwned(doc,journal.documents[doc.key]);
  }
 }
 return {stage:'documents-authored',siteComplete:false,documents:structuredClone(journal.documents)} as const;
}
