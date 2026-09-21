import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import block from '../../../../../../../blocks/lms/course-grid/render';
import {prepareBlocks,type BlockInstance} from './model';
import {BlockPaginationProvider} from './pagination';
import {resolveCoursesDemo} from '../../../../block-demo/courses-adapter';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {courseGridResultSchema} from '../block-data/portable/courseContracts';
import {planCanonicalData} from '../block-data/portable/planner';
import {validateCanonicalData} from '../block-data/portable/resolve';
import type {BlockPageRequest} from '../block-data/portable/postGridContracts';
const scope={websiteKey:'school',instanceKey:'staging'},policy={enabledPlugins:['lms'],capabilities:['reference.targetResolution','viewer.authorization'],disabledBlocks:[]};
const tree:BlockInstance[]=[{id:'courses',name:'lms/course-grid',version:1,attrs:{limit:3}}];
async function installed(request:BlockPageRequest={},preparing=false){
 const current={scope,documentKey:'course-page',revision:'1',viewerKey:'demo-learner',request};
 const envelope=await resolveCoursesDemo(tree,scope,policy,request),host=createDemoContentPageHost();
 if(preparing){const entry=envelope.dataByBlock.courses;if(entry.resolver!=='lms.courses')throw Error('Wrong fixture');for(const course of entry.data.items)course.progress={state:'preparing'};}
 const grant=host.install({tree,context:current,policy,envelope});
 const render=()=>renderToStaticMarkup(<BlockPaginationProvider href="/learning?source=nav#courses">{prepareBlocks(tree,{'lms/course-grid':block},policy,{media:{}},{grant,current})}</BlockPaginationProvider>);
 return {envelope,host,render};
}
test('course cards render images, true progress, destinations and advancing accessible pagination',async()=>{
 const f=await installed(),html=f.render();expect(html).toContain('Working with clay');expect(html).toContain('Everyday typography');expect(html).toContain('5 of 12 lessons');expect(html).toContain('42%');expect(html).toContain('value="42"');expect(html).toContain('Continue learning');expect(html).toContain('Revisit course');expect(html).toContain('href="/courses/studio-course-0"');expect(html).toContain('aria-label="Course pagination"');expect(html).toContain('source=nav');expect(html).toContain('#courses');expect(html).not.toContain('$');
 const next=await installed({courses:'demo-courses:3'});expect(next.render()).not.toContain('Working with clay');expect(next.render()).toContain('Back to first courses');
 f.host.invalidate();expect(()=>f.render()).toThrow();
});
test('course result contracts reject private fields, false 100%, arbitrary links and another page cursor',async()=>{
 const f=await installed(),entry=f.envelope.dataByBlock.courses;if(entry.resolver!=='lms.courses')throw Error('Wrong fixture');
 const raw=structuredClone(entry.data);raw.items[0].progress={completed:199,total:200,percent:100};expect(courseGridResultSchema.safeParse(raw).success).toBe(false);
 expect(courseGridResultSchema.safeParse({...entry.data,items:[{...entry.data.items[0],authorId:'private'}]}).success).toBe(false);
 expect(courseGridResultSchema.safeParse({...entry.data,items:[{...entry.data.items[0],href:'/admin'}]}).success).toBe(false);
 entry.data.cursor='foreign';expect(()=>validateCanonicalData(tree,scope,policy,f.envelope)).toThrow();
 expect(()=>planCanonicalData(tree,scope,{...policy,enabledPlugins:[]})).toThrow();expect(()=>planCanonicalData(tree,scope,{...policy,capabilities:['reference.targetResolution']})).toThrow();
});

test('rebuilding learner totals show a truthful pending label without stale percentages',async()=>{
 const f=await installed({},true),html=f.render();
 expect(html).toContain('Updating your progress…');
 expect(html).not.toContain('<progress');
 expect(html).not.toContain('42%');
 expect(html).not.toContain('Continue learning');
 expect(html).toContain('Explore course');
});
