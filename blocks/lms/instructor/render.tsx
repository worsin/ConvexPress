import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import {useBlockPageHref} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import './render.css';
export default defineDataBlock('lms/instructor','lms.instructor',({data,blockId})=>{
 const href=useBlockPageHref(blockId),first=data.cursor?href(null):null,next=data.nextCursor?href(data.nextCursor):null;
 const instructor=data.instructor;
 return <section className="cp-instructor" aria-label="Instructor profile">
  {instructor?<div className="cp-instructor-layout">
   <div className="cp-instructor-identity"><div className="cp-instructor-portrait">{instructor.image?<img src={instructor.image.src} alt={instructor.image.alt} loading="lazy" decoding="async"/>:<span aria-hidden="true">{instructor.name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase()}</span>}</div><P.Eyebrow>Meet your instructor</P.Eyebrow><P.Heading level={2} size="lg">{instructor.name}</P.Heading>{instructor.bio&&<P.Text tone="muted">{instructor.bio}</P.Text>}</div>
   <div className="cp-instructor-teaching"><P.Eyebrow>Learn together</P.Eyebrow><P.Heading level={3} size="md">Courses with {instructor.name}</P.Heading><ol>{data.courses.map((course,index)=><li key={course.id}><span className="cp-instructor-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><P.Link href={course.href} label={course.title}/><span className="cp-instructor-arrow" aria-hidden="true">↗</span></li>)}</ol><P.Text size="sm" tone="muted">A place to begin. A practice to grow.</P.Text></div>
  </div>:<P.Text tone="muted">{data.cursor?'No instructor courses are available on this page.':'An instructor profile will appear here when available.'}</P.Text>}
  {(data.cursor||data.nextCursor)&&<nav className="cp-instructor-pagination" aria-label="Instructor course pagination">{first&&<P.Link href={first} label="Back to first courses"/>}{next&&<P.Link href={next} label="More courses →"/>}{!first&&!next&&<P.Text size="sm" tone="muted">Explore more courses on the published website.</P.Text>}</nav>}
 </section>;
});
