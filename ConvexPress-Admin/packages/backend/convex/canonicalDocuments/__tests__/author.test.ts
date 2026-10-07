import {test,expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {readAuthor} from '../author';
import {RequestReadLedger,CANONICAL_READ_LIMITS} from '../../helpers/requestReadLedger';
import {authorResultSchema,authorMatchesArgs} from '../foundation/authorContracts';
const modules={'./convex/_generated/api.js':()=>import('../../_generated/api.js'),'./convex/_generated/server.js':()=>import('../../_generated/server.js'),'./convex/membership/policyReads.ts':()=>import('../../membership/policyReads')};
async function fixture(){
 const t=convexTest({schema,modules});
 const user=await t.run(async ctx=>{
  const id=await ctx.db.insert('users',{authSource:'local',displayName:'Public writer',bio:'Public biography',slug:'public-writer',email:'PRIVATE@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
  await ctx.db.insert('settings',{section:'plugins',values:{membershipEnabled:true},updatedBy:id,updatedAt:1});
  return id;
 });
 return {t,user,read:(userId:string=user,budget?:RequestReadLedger)=>t.run(ctx=>readAuthor(ctx,{userId},budget))};
}
test('author reads only a selected active site profile, never account fields or a substitute author',async()=>{
 const f=await fixture();const result=await f.read();
 expect(result.author).toEqual({id:f.user,name:'Public writer',bio:'Public biography',href:'/author/public-writer',image:null});
 for(const value of ['PRIVATE','email','authSource','status','createdAt'])expect(JSON.stringify(result)).not.toContain(value);
 expect((await f.read('')).author).toBeNull();expect((await f.read('invalid')).author).toBeNull();
 for(const patch of [{status:'inactive'},{status:'active',authSource:'management'},{authSource:'local',internalRole:'management'}]){
  await f.t.run(ctx=>ctx.db.patch('users',f.user,patch as any));expect((await f.read()).author).toBeNull();
 }
 await f.t.run(ctx=>ctx.db.delete('users',f.user));expect((await f.read()).author).toBeNull();
});
test('author does not invent an archive, expose an email-shaped account name or accept unsafe avatars',async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch('users',f.user,{displayName:'PRIVATE@example.invalid',nickname:'Public nickname',slug:undefined,avatarUrl:'javascript:alert(1)'}));
 expect((await f.read()).author).toMatchObject({name:'Public nickname',href:null,image:null});
 await f.t.run(ctx=>ctx.db.patch('users',f.user,{nickname:undefined,avatarUrl:'https://example.invalid/avatar.png'}));
 expect((await f.read()).author).toMatchObject({name:'Author',image:{src:'https://example.invalid/avatar.png'}});
});
test('an exact author route restriction withdraws the card and full stored rows count toward the read budget',async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.insert('membership_restriction_rules',{resourceType:'route',resourceIdOrKey:'/author/public-writer',ruleMode:'allow_only',planIds:[],loginRequired:true,teaserMode:'hide',createdAt:1,updatedAt:1}));
 expect((await f.read()).author).toBeNull();
 await f.t.run(ctx=>ctx.db.patch('users',f.user,{bio:'x'.repeat(4000)}));
 await expect(f.read(f.user,new RequestReadLedger({...CANONICAL_READ_LIMITS,documentBytes:1000}))).rejects.toMatchObject({data:{code:'CANONICAL_READ_BUDGET'}});
});
test('author DTO rejects unrelated identities, unsafe routes and extra account fields',()=>{
 const author={id:'author-a',name:'Author',bio:'',href:'/author/a',image:null};
 expect(authorMatchesArgs({userId:'author-a',useCurrentAuthor:false},{author})).toBe(true);
 expect(authorMatchesArgs({userId:'author-b',useCurrentAuthor:false},{author})).toBe(false);
 expect(authorMatchesArgs({useCurrentAuthor:false}, {author})).toBe(false);
 expect(authorResultSchema.safeParse({author:{...author,email:'private'}}).success).toBe(false);
 expect(authorResultSchema.safeParse({author:{...author,href:'/admin'}}).success).toBe(false);
});
test('selected media is authoritative and withdrawal never falls back to an older avatar URL',async()=>{
 const f=await fixture();const media=await f.t.run(async ctx=>{
  const id=await ctx.db.insert('media',{title:'Portrait',fileName:'portrait.png',slug:'portrait',url:'https://example.invalid/current.png',mimeType:'image/png',mediaType:'image',fileSize:20,status:'active',uploadedBy:f.user,createdAt:1,updatedAt:1});
  await ctx.db.patch('users',f.user,{avatarMediaId:id,avatarUrl:'https://example.invalid/old.png'});return id;
 });
 expect((await f.read()).author?.image?.src).toBe('https://example.invalid/current.png');
 await f.t.run(ctx=>ctx.db.patch('media',media,{status:'trashed'}));expect((await f.read()).author?.image).toBeNull();
 await f.t.run(ctx=>ctx.db.delete('media',media));expect((await f.read()).author?.image).toBeNull();
});

test('current author never falls back to a caller-selected identity without an authorized host document',async()=>{
 const f=await fixture();expect((await f.t.run(ctx=>readAuthor(ctx,{useCurrentAuthor:true,userId:f.user}))).author).toBeNull();
});
