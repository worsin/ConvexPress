import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import block from '../../../../../../../blocks/membership/plans/render';
import {prepareBlocks,type BlockInstance} from './model';
import {BlockPaginationProvider} from './pagination';
import {resolveMembershipPlansDemo} from '../../../../block-demo/membership-plans-adapter';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {membershipPlansResultSchema,membershipPlansMatchArgs,membershipPlansArgsSchema} from '../block-data/portable/membershipPlanContracts';
import {planCanonicalData} from '../block-data/portable/planner';
import {validateCanonicalData} from '../block-data/portable/resolve';
import type {BlockPageRequest} from '../block-data/portable/postGridContracts';
const scope={websiteKey:'studio',instanceKey:'staging'},policy={enabledPlugins:['membership'],capabilities:['reference.targetResolution'],disabledBlocks:[]};
const tree:BlockInstance[]=[{id:'plans',name:'membership/plans',version:1,attrs:{limit:3,heading:'The <script>studio</script>',actionLink:'/contact',actionLabel:'Find your place'}}];
async function installed(content=tree,request:BlockPageRequest={}){
 const current={scope,documentKey:'plans',revision:'1',viewerKey:'public',request};const envelope=await resolveMembershipPlansDemo(content,scope,policy,request),host=createDemoContentPageHost();
 const grant=host.install({tree:content,context:current,policy,envelope});
 const render=()=>renderToStaticMarkup(<BlockPaginationProvider href="/memberships?source=nav#plans">{prepareBlocks(content,{'membership/plans':block},policy,{media:{}},{grant,current})}</BlockPaginationProvider>);
 return {current,envelope,host,render};
}
test('membership cards render authored content, true benefits and accessible pagination without fictitious prices',async()=>{
 const first=await installed(),html=first.render();expect(html).toContain('Studio Notes');expect(html).toContain('The Makers Circle');expect(html).toContain('Open Workshop');expect(html).toContain('Letters from the studio');expect(html).toContain('The &lt;script&gt;studio&lt;/script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('$');expect(html).not.toContain('/pricing');expect(html).toContain('href="/contact"');expect(html).toContain('aria-label="Membership plan pagination"');expect(html).toContain('source=nav');expect(html).toContain('#plans');
 const next=await installed(tree,{plans:'demo-plans:3'});expect(next.render()).toContain('The Reading Room');expect(next.render()).not.toContain('Studio Notes');expect(next.render()).toContain('Back to first plans');
 const last=await installed(tree,{plans:'demo-plans:6'});expect(last.render()).toContain('Studio Residency');expect(last.render()).not.toContain('More memberships');
});
test('selected plans retain their exact author order, empty selections remain empty, and retired data is refused',async()=>{
 const selected=await installed([{...tree[0],attrs:{selection:'selected',plans:['demo-plan-workshop','demo-plan-studio']}}]);const html=selected.render();expect(html.indexOf('Open Workshop')).toBeLessThan(html.indexOf('Studio Notes'));expect(html).not.toContain('The Makers Circle');
 const empty=await installed([{...tree[0],attrs:{selection:'selected',plans:[]}}]);expect(empty.render()).toContain('No membership plans');expect(empty.render()).not.toContain('Studio Notes');selected.host.invalidate();expect(()=>selected.render()).toThrow();
});
test('plan results and navigation remain bound to selection, order, cursor and policy',async()=>{
 const fixture=await installed(),tampered=structuredClone(fixture.envelope);const entry=tampered.dataByBlock.plans;
 if(entry.resolver!=='membership.plans')throw Error('Wrong test resolver');entry.data.cursor='other-cursor';expect(()=>validateCanonicalData(tree,scope,policy,tampered)).toThrow();
 const args=membershipPlansArgsSchema.parse({selection:'selected',plans:['first','second']});const item=(id:string)=>({id,title:id,description:'',benefits:[]});
 expect(membershipPlansMatchArgs(args,{items:[item('second'),item('first')],cursor:null,nextCursor:null})).toBe(false);expect(membershipPlansMatchArgs(args,{items:[item('other')],cursor:null,nextCursor:null})).toBe(false);
 expect(membershipPlansResultSchema.safeParse({items:[{...item('first'),linkedRoleId:'private'}],cursor:null,nextCursor:null}).success).toBe(false);
 expect(()=>planCanonicalData(tree,scope,{...policy,enabledPlugins:[]})).toThrow();expect(()=>planCanonicalData(tree,scope,{...policy,capabilities:[]})).toThrow();expect(()=>planCanonicalData(tree,scope,policy,{missing:'position'})).toThrow();
});
