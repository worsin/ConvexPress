import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import block from '../../../../../../../blocks/lms/progress/render';
import {prepareBlocks,type BlockInstance} from './model';
import {BlockPaginationProvider} from './pagination';
import {resolveProgressDemo} from '../../../../block-demo/progress-adapter';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {validateCanonicalData} from '../block-data/portable/resolve';
const scope={websiteKey:'school',instanceKey:'staging'},policy={enabledPlugins:['lms'],capabilities:['reference.targetResolution','viewer.authorization'],disabledBlocks:[]};
const tree:BlockInstance[]=[{id:'learning',name:'lms/progress',version:1,attrs:{}}];
async function installed(request:Record<string,string>={},state?:'signedOut'|'unavailable'){
 const current={scope,documentKey:'progress-page',revision:'1',viewerKey:'demo-learner',request};
 const envelope=await resolveProgressDemo(tree,scope,policy,request),host=createDemoContentPageHost();
 const entry=envelope.dataByBlock.learning;if(entry.resolver!=='lms.progress')throw Error('Wrong fixture');
 if(state)entry.data={state,items:[],cursor:null,nextCursor:null};
 const grant=host.install({tree,context:current,policy,envelope});
 const render=()=>renderToStaticMarkup(<BlockPaginationProvider href="/learning?from=home#study">{prepareBlocks(tree,{'lms/progress':block},policy,{media:{}},{grant,current})}</BlockPaginationProvider>);
 return {envelope,host,render};
}
test('learning summary shows actual lesson counts, completed and pending states and advancing page links',async()=>{
 const f=await installed(),html=f.render();expect(html).toContain('5 of 12 lessons complete');expect(html).toContain('8 of 8 lessons complete');expect(html).toContain('value="42"');expect(html).toContain('Updating progress');expect(html).toContain('Revisit course');expect(html).toContain('Continue learning');expect(html).toContain('More courses');expect(html).toContain('#study');
 const next=await installed({learning:'demo-progress:6'});expect(next.render()).toContain('Designing with purpose');expect(next.render()).not.toContain('Working with clay');expect(next.render()).toContain('Back to first courses');
 f.host.invalidate();expect(()=>f.render()).toThrow();
});
test('signed-out and unavailable summaries have no stale course names or progress meters',async()=>{
 for(const state of ['signedOut','unavailable'] as const){const html=(await installed({},state)).render();expect(html).not.toContain('<progress');expect(html).not.toContain('Working with clay');expect(html).toContain(state==='signedOut'?'Sign in to see':'not available here');}
});
test('private fields, false completion and a different course target are rejected at installation',async()=>{
 const f=await installed(),entry=f.envelope.dataByBlock.learning;if(entry.resolver!=='lms.progress')throw Error('Wrong fixture');
 entry.data.items[0].progress={completed:199,total:200,percent:100};expect(()=>validateCanonicalData(tree,scope,policy,f.envelope)).toThrow();
 const selected:BlockInstance[]=[{id:'learning',name:'lms/progress',version:1,attrs:{scope:'course',course:'demo-course-0'}}];
 const value=await resolveProgressDemo(selected,scope,policy),result=value.dataByBlock.learning;if(result.resolver!=='lms.progress')throw Error('Wrong fixture');result.data.items[0].id='other-course';expect(()=>validateCanonicalData(selected,scope,policy,value)).toThrow();
});
