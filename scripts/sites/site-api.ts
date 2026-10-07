import { createRequire } from 'node:module';
import type { AuthoringApi, Target, Row } from './author-documents';
const require=createRequire(new URL('../../ConvexPress-Admin/packages/backend/package.json',import.meta.url));
const {makeFunctionReference}=require('convex/server');
type Client={query:(reference:unknown,args:Record<string,unknown>)=>Promise<any>;mutation:(reference:unknown,args:Record<string,unknown>)=>Promise<any>};
/** The same adapter is used by the CLI and real Convex-handler integration tests. */
export function createSiteApi(client:Client,target:Target,packId:string):AuthoringApi {
 const query=(name:string,args:Record<string,unknown>)=>client.query(makeFunctionReference(name),args);
 return {
  async identity(){
   const snapshot=await query('settings/templateDrafts:snapshot',{});
   if(snapshot?.values?.active!==packId)throw Error('PACK_NOT_ACTIVE');
   return {...snapshot.identity,origin:target.origin};
  },
  async find(type,slug){const row=await query(`${type==='page'?'pages':'posts'}/queries:get`,{slug});return row?{id:row._id}:null;},
  async read(id){
   const [raw,opened]=await Promise.all([query('posts/queries:get',{postId:id}),query('canonicalDocuments:get',{postId:id})]);
   if(!raw||!opened)return null;
   if(opened.contract!=='canonical-document-v1' || opened.scope.websiteKey!==target.websiteKey || opened.scope.instanceKey!==target.instanceKey || raw._id!==opened.document.id)throw Error('CANONICAL_SCOPE_MISMATCH');
   const d=opened.document;
   return {id:d.id,type:d.type,title:d.title,slug:raw.slug,revision:d.revision,blocks:d.blocks,status:d.status} satisfies Row;
  },
  mutate:(name,args)=>client.mutation(makeFunctionReference(name),args),
 };
}
