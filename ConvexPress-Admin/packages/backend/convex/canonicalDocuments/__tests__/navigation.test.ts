import {test, expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {createNavigationReader} from '../navigation';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
const modules = {
  './convex/_generated/api.js': () => import('../../_generated/api.js'),
  './convex/_generated/server.js': () => import('../../_generated/server.js'),
  './convex/membership/policyReads.ts': () => import('../../membership/policyReads'),
};
async function fixture() {
  const t = convexTest({schema, modules});
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert('users',{authSource:'local',email:'navigation@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
    await ctx.db.insert('settings',{section:'plugins',values:{membershipEnabled:false},updatedAt:1,updatedBy:user});
    await ctx.db.insert('settings',{section:'general',values:{siteTitle:'A real site name',tagline:'Authored public tagline',logoUrl:'https://images.example.invalid/actual-logo.png',adminEmail:'private@example.invalid',privateKey:'must-not-escape'},updatedAt:1,updatedBy:user});
    const parent = await ctx.db.insert('posts',{type:'page',title:'Public parent',slug:'parent',path:'/parent',content:'private body excluded',status:'publish',visibility:'public',authorId:user,commentStatus:'closed',createdAt:1,updatedAt:1});
    const child = await ctx.db.insert('posts',{type:'page',title:'Current page',slug:'child',path:'/parent/child',parentId:parent,content:'secret current body excluded',status:'draft',visibility:'public',authorId:user,commentStatus:'closed',createdAt:1,updatedAt:1});
    return {parent,child};
  });
  return {t,ids};
}
test('trusted current-document breadcrumbs include only discoverable ancestors and current identity',async () => {
  const {t,ids}=await fixture();
  const run=()=>t.run(async ctx => {
    const document=await ctx.db.get('posts',ids.child); if(!document) throw Error('missing');
    const reader=createNavigationReader(ctx,{document,tree:[]});
    return await reader('content.breadcrumbs',{source:'auto'});
  });
  expect(await run()).toEqual({items:[{label:'Public parent',href:'/page/parent',current:false},{label:'Current page',href:'/page/parent/child',current:true}],currentPath:'/page/parent/child'});
  await t.run(async ctx=>ctx.db.patch('posts',ids.parent,{visibility:'private'}));
  expect(await run()).toEqual({items:[{label:'Current page',href:'/page/parent/child',current:true}],currentPath:'/page/parent/child'});
  await t.run(async ctx=>ctx.db.patch('posts',ids.parent,{visibility:'public',status:'draft'}));
  expect(JSON.stringify(await run()).includes('Public parent')).toBe(false);
});
test('manual breadcrumbs need no ancestor read; site-info returns only public fields and safe logo', async () => {
  const {t,ids}=await fixture();
  await t.run(async ctx=>{
    const document=await ctx.db.get('posts',ids.child); if(!document) throw Error('missing');
    const budget=new RequestReadLedger();
    const reader=createNavigationReader(ctx,{document,tree:[]},budget);
    expect(await reader('content.breadcrumbs',{source:'manual'})).toEqual({items:[],currentPath:'/page/parent/child'});
    expect(budget.queries).toBe(0);
    expect(await reader('site.info',{})).toEqual({name:'A real site name',tagline:'Authored public tagline',logo:{src:'https://images.example.invalid/actual-logo.png',alt:'A real site name'}});
    expect(budget.queries).toBe(1);
    expect(budget.documents).toBe(1);
  });
});
test('ancestry cycles refuse instead of looping or truncating an invented trail', async () => {
  const {t,ids}=await fixture();
  await t.run(async ctx=>ctx.db.patch('posts',ids.parent,{parentId:ids.child}));
  let message='';
  try {await t.run(async ctx=>{const document=await ctx.db.get('posts',ids.child);if(!document)throw Error();return createNavigationReader(ctx,{document,tree:[]})('content.breadcrumbs',{source:'auto'});});}
  catch(error) {message=String(error);}
  expect(message.includes('cycle')).toBe(true);
});

test('child pages honor menu order and depth, omit hidden branches and expose only navigation fields', async () => {
  const {t,ids}=await fixture();
  const pages=await t.run(async ctx=>{
    const parent=await ctx.db.get('posts',ids.parent); if(!parent)throw Error();
    const add=(title:string,parentId:typeof ids.parent,menuOrder:number,visibility:'public'|'private'='public')=>ctx.db.insert('posts',{
      type:'page',title,slug:title.toLowerCase(),path:`/parent/${title.toLowerCase()}`,parentId,menuOrder,status:'publish',visibility,
      authorId:parent.authorId,content:'must-not-leak-body',excerpt:'must-not-leak-excerpt',commentStatus:'closed',createdAt:1,updatedAt:1,
    });
    const second=await add('Second',ids.parent,20),first=await add('First',ids.parent,10);
    const nested=await add('Nested',first,0),deep=await add('Deep',nested,0);
    const hidden=await add('Hidden',ids.parent,5,'private');await add('HiddenDescendant',hidden,0);
    return {first,second,nested,deep};
  });
  const read=(depth:number)=>t.run(async ctx=>{
    const document=await ctx.db.get('posts',ids.parent);if(!document)throw Error();
    return createNavigationReader(ctx,{document,tree:[]})('content.childPages',{depth});
  });
  expect(await read(1)).toEqual({parentLabel:'Public parent',items:[
    {id:pages.first,parentId:null,depth:1,label:'First',href:'/page/parent/first'},
    {id:pages.second,parentId:null,depth:1,label:'Second',href:'/page/parent/second'},
  ]});
  const result=await read(2);
  expect('items' in result && result.items.map(item=>'label' in item?item.label:'')).toEqual(['First','Nested','Second']);
  expect(JSON.stringify(result)).not.toContain('must-not-leak');
  expect(JSON.stringify(result)).not.toContain('Hidden');
  expect(JSON.stringify(result)).not.toContain('Deep');
  await t.run(async ctx=>ctx.db.patch('posts',pages.first,{status:'draft'}));
  expect(JSON.stringify(await read(4))).not.toContain('Nested');
  await t.run(async ctx=>{
    const plugins=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();if(!plugins)throw Error();
    await ctx.db.patch('settings',plugins._id,{values:{membershipEnabled:true}});
    await ctx.db.insert('membership_restriction_rules',{resourceType:'page',resourceIdOrKey:pages.second,ruleMode:'allow_only',planIds:[],requiredCapabilities:['private.reader'],teaserMode:'hide',loginRequired:true,createdAt:1,updatedAt:1});
  });
  expect(await read(4)).toEqual({parentLabel:'Public parent',items:[]});
});

test('child-page cycles and full-source budgets fail explicitly instead of returning a partial directory',async()=>{
 const {t,ids}=await fixture();
 await t.run(async ctx=>{await ctx.db.patch('posts',ids.child,{status:'publish'});await ctx.db.patch('posts',ids.parent,{parentId:ids.child});});
 await expect(t.run(async ctx=>{const document=await ctx.db.get('posts',ids.parent);if(!document)throw Error();return createNavigationReader(ctx,{document,tree:[]})('content.childPages',{depth:4});})).rejects.toThrow('cycle');
 await t.run(async ctx=>ctx.db.patch('posts',ids.parent,{parentId:undefined}));
 await expect(t.run(async ctx=>{
  const document=await ctx.db.get('posts',ids.parent);if(!document)throw Error();
  const budget=new RequestReadLedger({queries:1,documents:1,bytes:16,documentBytes:16});
  return createNavigationReader(ctx,{document,tree:[]},budget)('content.childPages',{depth:1});
 })).rejects.toThrow();
});

test('hidden source rows also count toward the directory traversal bound',async()=>{
 const {t,ids}=await fixture();
 await t.run(async ctx=>{
  const parent=await ctx.db.get('posts',ids.parent);if(!parent)throw Error();
  for(let i=0;i<81;i++)await ctx.db.insert('posts',{type:'page',title:`Draft ${i}`,slug:`draft-${i}`,parentId:ids.parent,menuOrder:i,status:'draft',visibility:'public',authorId:parent.authorId,commentStatus:'closed',createdAt:1,updatedAt:1});
 });
 await expect(t.run(async ctx=>{const document=await ctx.db.get('posts',ids.parent);if(!document)throw Error();return createNavigationReader(ctx,{document,tree:[]})('content.childPages',{depth:1});})).rejects.toThrow('80-source limit');
});
