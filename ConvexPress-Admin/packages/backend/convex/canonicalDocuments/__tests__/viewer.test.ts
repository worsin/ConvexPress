import {test, expect} from 'bun:test';
import {convexTest} from 'convex-test';
import schema from '../../schema';
import {createNavigationReader} from '../navigation';
import {RequestReadLedger} from '../../helpers/requestReadLedger';
import {resolveCanonicalData, validateCanonicalData} from '../foundation/resolve';
import {navigationResultSchemas} from '../foundation/navigationContracts';
const modules = {
  './convex/_generated/api.js': () => import('../../_generated/api.js'),
  './convex/_generated/server.js': () => import('../../_generated/server.js'),
};
const tree = [{id:'account',name:'core/account-teaser',version:1,attrs:{}}];
const scope = {websiteKey:'viewer-fixture',instanceKey:'staging'};
const policy = {enabledPlugins:[],capabilities:['viewer.authorization'],disabledBlocks:[]};
const signedOut = {state:'signed-out',href:'/login?returnTo=%2Fdashboard'};

test('account projection recognizes only the active user in this site and exposes no personal fields', async () => {
  const t = convexTest({schema,modules});
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert('users',{authSource:'local',email:'private@example.invalid',emailVerified:true,status:'active',createdAt:1,updatedAt:1});
    const page = await ctx.db.insert('posts',{type:'page',title:'Account',slug:'account',status:'publish',visibility:'public',authorId:user,commentStatus:'closed',createdAt:1,updatedAt:1});
    return {user,page};
  });
  const client = t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
  const read = (as = t) => as.run(async ctx => {
    const document = await ctx.db.get('posts',ids.page); if (!document) throw Error('missing page');
    const budget = new RequestReadLedger();
    const envelope = await resolveCanonicalData(tree,scope,policy,async () => {throw Error('unexpected content read');}, createNavigationReader(ctx,{document,tree},budget));
    validateCanonicalData(tree,scope,policy,envelope);
    expect(budget.queries).toBeLessThanOrEqual(1);
    return envelope.dataByBlock.account.data;
  });
  expect(await read()).toEqual(signedOut);
  expect(await read(client)).toEqual({state:'signed-in',href:'/dashboard'});
  await t.run(ctx => ctx.db.patch('users',ids.user,{status:'inactive'}));
  expect(await read(client)).toEqual(signedOut);
  await t.run(ctx => ctx.db.patch('users',ids.user,{status:'active',authSource:'clerk',clerkUserId:'other-provider-user'}));
  expect(await read(client)).toEqual(signedOut);
  const customer = t.withIdentity({subject:'other-provider-user',tokenIdentifier:'https://clerk.example.invalid|other-provider-user'});
  expect(await read(customer)).toEqual({state:'signed-in',href:'/dashboard'});
  await t.run(ctx => ctx.db.patch('users',ids.user,{status:'banned'}));
  expect(await read(customer)).toEqual(signedOut);
  const unknown = t.withIdentity({subject:'unregistered-clerk-viewer',tokenIdentifier:'https://clerk.example.invalid|unregistered-clerk-viewer'});
  expect(await read(unknown)).toEqual(signedOut);
});

test('viewer envelopes reject personal fields, arbitrary destinations and missing trusted reader', async () => {
  const result = navigationResultSchemas['site.viewer'];
  expect(result.safeParse({...signedOut,email:'private@example.invalid'}).success).toBe(false);
  expect(result.safeParse({...signedOut,href:'https://elsewhere.invalid'}).success).toBe(false);
  expect(result.safeParse({...signedOut,href:'/dashboard'}).success).toBe(false);
  await expect(resolveCanonicalData(tree,scope,policy,async()=>({page:null}))).rejects.toThrow('Trusted');
  await expect(resolveCanonicalData(tree,scope,{...policy,capabilities:[]},async()=>({page:null}),async()=>signedOut)).rejects.toThrow();
});
