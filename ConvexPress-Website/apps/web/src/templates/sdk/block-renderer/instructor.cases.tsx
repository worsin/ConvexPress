import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import block from '../../../../../../../blocks/lms/instructor/render';
import {prepareBlocks,type BlockInstance} from './model';
import {BlockPaginationProvider} from './pagination';
import {resolveInstructorDemo} from '../../../../block-demo/instructor-adapter';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {validateCanonicalData} from '../block-data/portable/resolve';
const scope={websiteKey:'school',instanceKey:'staging'},policy={enabledPlugins:['lms'],capabilities:['reference.targetResolution'],disabledBlocks:[]};
const tree:BlockInstance[]=[{id:'teacher',name:'lms/instructor',version:1,attrs:{instructor:'demo-instructor'}}];
async function installed(request:Record<string,string>={}){
 const current={scope,documentKey:'instructor-page',revision:'1',viewerKey:'public',request};
 const envelope=await resolveInstructorDemo(tree,scope,policy,request),host=createDemoContentPageHost();
 const grant=host.install({tree,context:current,policy,envelope});
 const render=()=>renderToStaticMarkup(<BlockPaginationProvider href="/learn?from=home#teacher">{prepareBlocks(tree,{'lms/instructor':block},policy,{media:{}},{grant,current})}</BlockPaginationProvider>);
 return {envelope,host,render};
}
test('instructor profile renders a bound identity, biography, exact course links and independent pagination',async()=>{
 const f=await installed(),html=f.render();expect(html).toContain('Robin Ellis');expect(html).toContain('Maker, educator');expect(html).toContain('href="/courses/studio-course-0"');expect(html).toContain('Instructor course pagination');expect(html).toContain('More courses');expect(html).toContain('from=home');expect(html).toContain('#teacher');
 const next=await installed({teacher:'demo-instructor:6'});expect(next.render()).toContain('Designing with purpose');expect(next.render()).not.toContain('Working with clay');expect(next.render()).toContain('Back to first courses');
 f.host.invalidate();expect(()=>f.render()).toThrow();
});
test('another instructor or changed page cannot be installed as the current selection',async()=>{
 const f=await installed(),entry=f.envelope.dataByBlock.teacher;if(entry.resolver!=='lms.instructor'||!entry.data.instructor)throw Error('Wrong fixture');
 entry.data.instructor.id='someone-else';expect(()=>validateCanonicalData(tree,scope,policy,f.envelope)).toThrow();
 entry.data.instructor.id='demo-instructor';entry.data.cursor='foreign';expect(()=>validateCanonicalData(tree,scope,policy,f.envelope)).toThrow();
});
