import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import {useBlockPageHref} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import './render.css';
export default defineDataBlock('lms/progress','lms.progress',({data,blockId})=>{
 const pageHref=useBlockPageHref(blockId),next=data.nextCursor?pageHref(data.nextCursor):null,first=data.cursor?pageHref(null):null;
 return <section className="cp-learner-progress" aria-label="Your learning progress">
  <P.Stack gap="sm"><P.Eyebrow>Your learning</P.Eyebrow><P.Heading level={2} size="lg">One lesson at a time.</P.Heading></P.Stack>
  {data.state==='signedOut'?<P.Text tone="muted">Sign in to see your learning progress.</P.Text>:data.state==='unavailable'?<P.Text tone="muted">Your progress is not available here.</P.Text>:<>
   {data.items.length?<div className="cp-learner-progress-grid">{data.items.map(course=>{const progress='state' in course.progress?null:course.progress;return <article className="cp-learner-progress-card" key={course.id}>
    <div className="cp-learner-progress-measure">{progress?<><span className="cp-learner-progress-number">{progress.percent}<span>%</span></span><P.Text size="sm" tone="muted">{progress.total===0?'No lessons published':progress.percent===100?'Completed':progress.completed===0?'Ready to begin':'In progress'}</P.Text></>:<P.Text tone="muted">Updating progress…</P.Text>}</div>
    <div className="cp-learner-progress-detail"><P.Heading level={3} size="md">{course.title}</P.Heading>{progress?<><progress aria-label={`${course.title} completion`} value={progress.percent} max={100}/><P.Text size="sm" tone="muted">{progress.completed} of {progress.total} lessons complete</P.Text></>:<P.Text size="sm" tone="muted">Your lesson totals are being refreshed.</P.Text>}<P.Link href={course.href} label={progress?.percent===100?'Revisit course →':progress&&progress.completed>0?'Continue learning →':'View course →'}/></div>
   </article>})}</div>:<P.Text tone="muted">{data.cursor?'No available courses on this page.':'When you begin a course, your progress will appear here.'}</P.Text>}
   {(data.cursor||data.nextCursor)&&<nav aria-label="Learner progress pagination" className="cp-learner-progress-pagination">{first&&<P.Link href={first} label="Back to first courses"/>}{next&&<P.Link href={next} label="More courses →"/>}{!first&&!next&&<P.Text size="sm" tone="muted">Explore more courses on the published website.</P.Text>}</nav>}
  </>}
 </section>;
});
