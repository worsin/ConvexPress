export type BulkPost = {id:string; title:string; revision:number|null};
export type BulkPostPatch = {status?:'draft'|'publish'|'private';commentStatus?:'open'|'closed';isSticky?:boolean};
export type BulkPostResult = BulkPost & {status:'updated'|'refused'|'uncertain'|'skipped';message:string};
export function captureBulkPost(row:{_id:string;title:string;blocksVersion?:number;blocksRevision?:number}):BulkPost {
 return {id:row._id,title:row.title,revision:row.blocksVersion===2 && Number.isSafeInteger(row.blocksRevision) ? row.blocksRevision! : null};
}
/** Each document is atomic. A batch may partially succeed; never conceal or
 * automatically replay refusals and requests with unknown acknowledgements. */
export async function applyBulkPostEdit(posts:readonly BulkPost[],patch:BulkPostPatch,
 write:(args:BulkPostPatch & {postId:string;expectedRevision:number})=>Promise<unknown>,isActive:()=>boolean=()=>true):Promise<BulkPostResult[]> {
 const results:BulkPostResult[]=[];
 for(const post of posts){
  if(!isActive()){results.push({...post,status:'skipped',message:'Not sent because the editing session closed.'});continue;}
  if(post.revision===null){results.push({...post,status:'refused',message:'Open this post in the editor and complete canonical migration first.'});continue;}
  try{await write({...patch,postId:post.id,expectedRevision:post.revision});results.push({...post,status:'updated',message:'Updated.'});}
  catch(error){
   const code=(error as {data?:{code?:string}})?.data?.code;
   results.push({...post,status:code?'refused':'uncertain',message:code==='CONFLICT'?'This post changed after selection. Review it before trying again.':code?'Update refused. Review the post and your current permissions.':'Verify this post before retrying; the save acknowledgement was not received.'});
  }
 }
 return results;
}
