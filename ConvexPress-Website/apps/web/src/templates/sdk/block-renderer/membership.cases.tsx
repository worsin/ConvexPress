import type {ResolverPolicy} from "../block-data/portable/contracts";
import {expect,test} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import membershipBlock from '../../../../../../../blocks/membership/gated-teaser/render';
import {prepareBlocks} from './model';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {resolveCanonicalData,validateCanonicalData} from '../block-data/portable/resolve';
import {membershipAccessResultSchema,type MembershipAccessResult} from '../block-data/portable/membershipContracts';
import {planCanonicalData} from '../block-data/portable/planner';
const policy:ResolverPolicy={enabledPlugins:['membership'],capabilities:['viewer.authorization','reference.targetResolution'],disabledBlocks:[]};
const current={scope:{websiteKey:'studio',instanceKey:'staging'},documentKey:'membership',revision:'1',viewerKey:'member'};
const tree=[{id:'teaser',name:'membership/gated-teaser',version:1,attrs:{requiredPlan:'plan-one',teaserText:'Our <script>studio</script>',upgradeLink:'/membership-options'}}];
const resolve=(value:MembershipAccessResult,content=tree,p=policy)=>resolveCanonicalData(content,current.scope,p,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>value);
async function installed(state:MembershipAccessResult['state']){
 const data:MembershipAccessResult=state==='unavailable'||state==='unconfigured'?{state,plan:null}:{state,plan:{id:'plan-one',title:'Studio Circle'}};
 const envelope=await resolve(data);const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,envelope,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{'membership/gated-teaser':membershipBlock},policy,{media:{}},{grant,current:context}))};
}
test('membership teaser shows truthful viewer state and authored upgrade links without inventing checkout offers',async()=>{
 for(const state of ['signed-out','missing-plan','granted','unavailable'] as const){
  const html=(await installed(state)).render();expect(html).toContain('Our &lt;script&gt;studio&lt;/script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('/pricing');
  if(state==='signed-out')expect(html).toContain('href="/login?returnTo=%2Fdashboard%2Fmembership"');
  if(state==='missing-plan'||state==='granted')expect(html).toContain('href="/dashboard/membership"');
  if(state==='granted'||state==='unavailable')expect(html).not.toContain('href="/membership-options"');
  else expect(html).toContain('href="/membership-options"');
  if(state==='unavailable'){expect(html).not.toContain('Studio Circle');expect(html).not.toContain('<a ');}
 }
});
test('retired membership grants, other viewers and other databases cannot reuse a displayed access result',async()=>{
 const {host,render}=await installed('granted');
 expect(()=>render({...current,viewerKey:'other-member'})).toThrow();expect(()=>render({...current,scope:{...current.scope,instanceKey:'production'}})).toThrow();host.invalidate();expect(()=>render()).toThrow();
});
test('membership data rejects wrong-plan answers, extra private fields and unavailable policy',async()=>{
 await expect(resolve({state:'granted',plan:{id:'plan-two',title:'Other plan'}})).rejects.toThrow('required plan');
 await expect(resolve({state:'unconfigured',plan:null})).rejects.toThrow();
 const {envelope}=await installed('granted');const tampered=structuredClone(envelope);const entry=tampered.dataByBlock.teaser;
 if(entry.resolver!=='membership.access'||!entry.data.plan)throw Error('unexpected fixture');entry.data.plan.id='plan-two';expect(()=>validateCanonicalData(tree,current.scope,policy,tampered)).toThrow();
 expect(membershipAccessResultSchema.safeParse({state:'granted',plan:{id:'plan-one',title:'Plan',email:'secret@example.invalid'}}).success).toBe(false);
 for(const p of [{...policy,enabledPlugins:[]},{...policy,capabilities:[]},{...policy,disabledBlocks:['membership/gated-teaser']}])await expect(resolve({state:'granted',plan:{id:'plan-one',title:'Plan'}},tree,p)).rejects.toThrow();
 expect(()=>planCanonicalData([{...tree[0],attrs:{...tree[0].attrs,upgradeLink:'javascript:alert(1)'}}],current.scope,policy)).toThrow();
 await expect(resolveCanonicalData(tree,current.scope,policy,async()=>null)).rejects.toThrow('Trusted membership reader');
});
