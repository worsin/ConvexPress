import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import {useBlockPageHref} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import './render.css';
export default defineDataBlock('lms/course-grid','lms.courses',({data,blockId})=>{
 const pageHref=useBlockPageHref(blockId),next=data.nextCursor?pageHref(data.nextCursor):null,first=data.cursor?pageHref(null):null;
 if(data.state==='preparing')return <section className="cp-course-grid" aria-label="Courses"><P.Text tone="muted">Courses are being prepared. Please check back shortly.</P.Text></section>;
 return <section className="cp-course-grid" aria-label="Courses">
  {data.items.length?<P.Grid gap="lg">{data.items.map(course=>{const progress=course.progress&&!("state" in course.progress)?course.progress:null;return <article key={course.id} className="cp-course-card">
   <div className="cp-course-cover">{course.image?<img src={course.image.src} alt={course.image.alt} loading="lazy" decoding="async"/>:<div className="cp-course-cover-empty" aria-hidden="true"><span>{course.title.slice(0,1)}</span></div>}</div>
   <div className="cp-course-copy"><P.Stack gap="md"><P.Eyebrow>Course</P.Eyebrow><P.Heading level={3} size="md">{course.title}</P.Heading>{course.excerpt&&<P.Text tone="muted">{course.excerpt}</P.Text>}</P.Stack>
    <div className="cp-course-card-end">{course.progress&&"state" in course.progress&&<P.Text size="sm" tone="muted">Updating your progress…</P.Text>}{progress&&<div className="cp-course-progress"><div><P.Text size="sm">{progress.completed} of {progress.total} lessons</P.Text><P.Text size="sm">{progress.percent}%</P.Text></div><progress aria-label={`${course.title} completion`} max={100} value={progress.percent}/></div>}
    <P.Link href={course.href} label={progress?.percent===100?'Revisit course →':progress&&progress.completed>0?'Continue learning →':'Explore course →'}/></div>
   </div>
  </article>})}</P.Grid>:<P.Text tone="muted">{data.cursor?'There are no courses to show on this page.':'No courses are available here yet.'}</P.Text>}
  {(data.cursor||data.nextCursor)&&<nav className="cp-course-pagination" aria-label="Course pagination"><P.Text size="sm" tone="muted">{data.items.length===1?'1 course':`${data.items.length} courses`}</P.Text><div>{first&&<P.Link href={first} label="Back to first courses"/>}{next&&<P.Link href={next} label="More courses →"/>}{!first&&!next&&<P.Text size="sm" tone="muted">Explore more courses on the published website.</P.Text>}</div></nav>}
 </section>;
});
