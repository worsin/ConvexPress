import {convexTest} from "convex-test";
import {makeFunctionReference as ref} from "convex/server";
import schema from "../../schema";
const offer=ref<"query">("leadMagnets/queries:offer");
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/leadMagnets/actions.ts":()=>import("../actions"),"./convex/leadMagnets/submission.ts":()=>import("../submission"),"./convex/leadMagnets/delivery.ts":()=>import("../delivery"),"./convex/leadMagnets/queries.ts":()=>import("../queries"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
export async function fixture(){
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"guide@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const settings=await ctx.db.insert("settings",{section:"plugins",values:{formsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const site=await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"guide",instanceKey:"guide-staging",environmentKind:"staging",deploymentOrigin:"https://guide.convex.cloud",managementOrigin:"https://controller.convex.cloud",siteOrigin:"https://guide.convex.site",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const list=await ctx.db.insert("mailingLists",{websiteKey:"guide",instanceKey:"guide-staging",name:"Field notes",description:"PRIVATE_LIST_DESCRIPTION",consentText:"I would also like occasional updates. I can unsubscribe at any time.",privacyUrl:"/privacy",status:"active",revision:1,createdBy:user,updatedBy:user,createdAt:1,updatedAt:1});
  const storage=await ctx.storage.store(new Blob(["REAL GUIDE BYTES"],{type:"application/pdf"}));
  const media=await ctx.db.insert("media",{title:"Field guide",fileName:"field-guide.pdf",slug:"field-guide",mimeType:"application/pdf",fileSize:99999,mediaType:"document",storageId:storage,url:"https://private.example.invalid/NEVER_PROJECT_THIS_URL",status:"active",uploadedBy:user,createdAt:1,updatedAt:1});
  const post=await ctx.db.insert("posts",{type:"page",title:"Guide",slug:"guide",path:"/guide",status:"publish",visibility:"public",authorId:user,commentStatus:"closed",blocksVersion:2,blocksRevision:1,blocks:[{id:"guide",name:"core/lead-magnet",version:1,attrs:{title:"Field guide",file:{id:media},list}}],contentMode:"blocks",createdAt:1,updatedAt:1});
  return {user,settings,site,list,storage,media,post};
 });
 const query=()=>t.query(offer,{postId:ids.post,blockId:"guide"});return {t,ids,query};
}
