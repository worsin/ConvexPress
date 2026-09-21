import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import block from '../../../../../../../blocks/lms/curriculum/render';
import {prepareBlocks,type BlockInstance} from './model';
import {BlockPaginationProvider} from './pagination';
import {resolveCurriculumDemo} from '../../../../block-demo/curriculum-adapter';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {validateCanonicalData} from '../block-data/portable/resolve';
const scope={websiteKey:'school',instanceKey:'staging'},policy={enabledPlugins:['lms'],capabilities:['reference.targetResolution'],disabledBlocks:[]};
async function installed(request:Record<string,string>={},expanded=false,course:string|undefined='demo-course-clay'){
 const tree:BlockInstance[]=[{id:'outline',name:'lms/curriculum',version:1,attrs:{...(course?{course}:{}),expanded}}];
 const current={scope,documentKey:'curriculum-page',revision:'1',viewerKey:'public',request};
 const envelope=await resolveCurriculumDemo(tree,scope,policy,request),host=createDemoContentPageHost();
 const grant=host.install({tree,context:current,policy,envelope});
 const render=()=>renderToStaticMarkup(<BlockPaginationProvider href="/learn?from=home#outline">{prepareBlocks(tree,{'lms/curriculum':block},policy,{media:{}},{grant,current})}</BlockPaginationProvider>);
 return {envelope,host,render,tree};
}
test('curriculum uses disclosure modules, distinguishes section headings and preserves independent pagination',async()=>{
 const f=await installed(),html=f.render();
 expect(html).toContain('<details');expect(html).not.toContain('open=""');expect(html).toContain('Tools and techniques');expect(html).toContain('cp-curriculum-section');expect(html).toContain('href="/courses/working-with-clay"');expect(html).toContain('This module continues on the next page.');expect(html).toContain('from=home');expect(html).toContain('#outline');
 const next=await installed({outline:'demo-curriculum:second'},true),second=next.render();
 expect(second).toContain('open=""');expect(second).toContain('Module · continued');expect(second).toContain('Finding your own expression');expect(second).not.toContain('Meet your materials');expect(second).toContain('Back to first modules');expect(second).not.toContain('Continue outline');
 f.host.invalidate();expect(()=>f.render()).toThrow();
});
test('curriculum refuses a foreign course, changed cursor and lesson payloads',async()=>{
 const f=await installed(),entry=f.envelope.dataByBlock.outline;if(entry.resolver!=='lms.curriculum'||!entry.data.course)throw Error('Wrong fixture');
 entry.data.course.id='another-course';expect(()=>validateCanonicalData(f.tree,scope,policy,f.envelope)).toThrow();
 entry.data.course.id='demo-course-clay';entry.data.cursor='foreign';expect(()=>validateCanonicalData(f.tree,scope,policy,f.envelope)).toThrow();
 entry.data.cursor=null;Object.assign(entry.data.groups[0].entries[0],{body:'private lesson body'});expect(()=>validateCanonicalData(f.tree,scope,policy,f.envelope)).toThrow();
});
test('unselected curriculum renders no invented modules or course actions',async()=>{
 const html=(await installed({},false,'')).render();expect(html).toContain('The curriculum is not available here.');expect(html).not.toContain('<details');expect(html).not.toContain('View course');
});
