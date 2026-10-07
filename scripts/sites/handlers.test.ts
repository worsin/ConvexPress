import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import schema from '../../ConvexPress-Admin/packages/backend/convex/schema';
import {authorDocuments,type Journal} from './author-documents';
import {createSiteApi} from './site-api';
const require=createRequire(new URL('../../ConvexPress-Admin/packages/backend/package.json',import.meta.url));
const {convexTest}=require('convex-test');
const modules={
 './convex/_generated/server.js':()=>import('../../ConvexPress-Admin/packages/backend/convex/_generated/server.js'),
 './convex/canonicalDocuments.ts':()=>import('../../ConvexPress-Admin/packages/backend/convex/canonicalDocuments'),
 './convex/posts/queries.ts':()=>import('../../ConvexPress-Admin/packages/backend/convex/posts/queries'),
 './convex/pages/queries.ts':()=>import('../../ConvexPress-Admin/packages/backend/convex/pages/queries'),
 './convex/settings/templateDrafts.ts':()=>import('../../ConvexPress-Admin/packages/backend/convex/settings/templateDrafts'),
 './convex/revisions/internals.ts':()=>import('../../ConvexPress-Admin/packages/backend/convex/revisions/internals'),
};
for(const pack of ['core','journal','depot','aster-house'])test(`${pack} authoring through actual Convex handlers preserves original rows and is idempotent`,async()=>{
 const t=convexTest({schema,modules});
 const target={origin:'https://example.convex.cloud',websiteKey:'example-'+pack,instanceKey:'example-'+pack+'-staging',environmentKind:'staging'};
 const ids=await t.run(async(ctx:any)=>{
  const role=await ctx.db.insert('roles',{name:'Example author',slug:'example-author',description:'Synthetic fixture',level:100,type:'internal',isDefault:false,isProtected:false,capabilities:['manage_options','page.create','post.create','page.update','post.update','page.read_private','post.read','post.read_private'],pageAccess:[],status:'active',createdAt:1,updatedAt:1});
  const user=await ctx.db.insert('users',{authSource:'local',email:'example-author@example.invalid',emailVerified:true,roleId:role,status:'active',createdAt:1,updatedAt:1});
  await ctx.db.insert('convexpress_siteIdentity',{identityKey:'site-identity',websiteKey:target.websiteKey,instanceKey:target.instanceKey,environmentKind:'staging',deploymentOrigin:target.origin,managementOrigin:'https://example.convex.site',siteOrigin:'https://example.invalid',siteContractVersion:'1',schemaVersion:'1',engineVersion:'1',managementCapabilities:[],initializedAt:1,updatedAt:1});
  await ctx.db.insert('settings',{section:'appearance.template',values:{active:pack,overrides:{},variants:{},settings:{}},legacyAppearanceMigration:{version:2,migratedAt:1},updatedAt:1,updatedBy:user});
  await ctx.db.insert('settings',{section:'plugins',values:{membershipEnabled:false},updatedAt:1,updatedBy:user});
  const original=await ctx.db.insert('posts',{type:'page',title:'Preserved owner page',slug:'owner-page',path:'/owner-page',content:'',blocksVersion:2,blocksRevision:1,blocks:[],status:'draft',visibility:'public',authorId:user,commentStatus:'closed',createdAt:1,updatedAt:1});
  return {user,original};
 });
 const client=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const before=await t.run((ctx:any)=>ctx.db.get('posts',ids.original));
 const recipe=JSON.parse(await readFile(new URL(`../../examples/sites/${pack}.json`,import.meta.url),'utf8'));
 const journal:Journal={version:1,operations:[],documents:{}};
 const run=()=>authorDocuments({recipe,target,api:createSiteApi(client,target,pack),journal,persist:async()=>{}});
 expect((await run()).stage).toBe('documents-authored');
 const snapshot=()=>t.run(async(ctx:any)=>({posts:await ctx.db.query('posts').collect(),revisions:await ctx.db.query('revisions').collect()}));
 const first=await snapshot();expect(first.posts).toHaveLength(recipe.documents.length+1);
 expect(first.posts.every((p:any)=>p.blocksVersion===2&&p.status==='draft')).toBe(true);
 expect(await t.run((ctx:any)=>ctx.db.get('posts',ids.original))).toEqual(before);
 await run();expect(await snapshot()).toEqual(first);
 for(const doc of recipe.documents)expect(journal.documents[doc.key].phase).toBe('authored');
});
