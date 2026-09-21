import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import {useBlockPageHref} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import './render.css';
export default defineDataBlock('lms/curriculum','lms.curriculum',({data,attrs,blockId})=>{
 const pageHref=useBlockPageHref(blockId),next=data.nextCursor?pageHref(data.nextCursor):null,first=data.cursor?pageHref(null):null;
 return <section className="cp-curriculum" aria-label="Course curriculum">{data.course?<>
  <div className="cp-curriculum-intro"><P.Stack gap="sm"><P.Eyebrow>Course outline</P.Eyebrow><P.Heading level={2} size="lg">{data.course.title}</P.Heading></P.Stack><P.Link href={data.course.href} label="View course →"/></div>
  {data.groups.length?<div className="cp-curriculum-groups">{data.groups.map((group,index)=>{
   const outline=<div className="cp-curriculum-outline">{group.entries.length?<ul>{group.entries.map(entry=><li key={entry.id} className={entry.kind==='section_heading'?'cp-curriculum-section':'cp-curriculum-lesson'}>{entry.kind==='section_heading'?<P.Heading level={4} size="sm">{entry.title}</P.Heading>:<><span className="cp-curriculum-dot" aria-hidden="true"/><P.Text>{entry.title}</P.Text><span className="cp-curriculum-kind">Lesson</span></>}</li>)}</ul>:!group.topic?.continues&&<P.Text size="sm" tone="muted">No lessons have been added to this module yet.</P.Text>}{group.topic?.continues&&<P.Text size="sm" tone="muted">This module continues on the next page.</P.Text>}</div>;
   return group.topic?<details key={group.topic.id+String(data.cursor)} className="cp-curriculum-module" open={attrs.expanded}><summary><div><P.Eyebrow>{group.topic.continued?'Module · continued':'Module'}</P.Eyebrow><P.Heading level={3} size="md">{group.topic.title}</P.Heading></div><svg className="cp-curriculum-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 9 6 6 6-6"/></svg></summary>{outline}</details>:<div key={'lessons-'+index} className="cp-curriculum-standalone"><P.Heading level={3} size="md">Lessons</P.Heading>{outline}</div>;
  })}</div>:<P.Text tone="muted">No lessons are available in this outline yet.</P.Text>}
  {(data.cursor||data.nextCursor)&&<nav className="cp-curriculum-pagination" aria-label="Curriculum pagination">{first&&<P.Link href={first} label="Back to first modules"/>}{next&&<P.Link href={next} label="Continue outline →"/>}{!first&&!next&&<P.Text size="sm" tone="muted">Explore the complete outline on the published website.</P.Text>}</nav>}
 </>:<P.Text tone="muted">The curriculum is not available here.</P.Text>}</section>;
});
