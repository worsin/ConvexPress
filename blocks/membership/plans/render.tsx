import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import {useBlockPageHref} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import './render.css';
export default defineDataBlock('membership/plans','membership.plans',({attrs,data,blockId})=>{
 const href=useBlockPageHref(blockId),next=data.nextCursor?href(data.nextCursor):null,first=data.cursor?href(null):null;
 return <section className="cp-membership-plans" aria-label={attrs.heading||'Membership plans'}>
  {(attrs.heading||attrs.introduction)&&<header className="cp-membership-plans-intro"><P.Stack gap="md">
   {attrs.heading&&<P.Heading level={2} size="lg">{attrs.heading}</P.Heading>}
   {attrs.introduction&&<P.Text size="lg" tone="muted">{attrs.introduction}</P.Text>}
  </P.Stack></header>}
  {data.items.length?<div className="cp-membership-plans-grid"><P.Grid gap="lg">{data.items.map(plan=><article key={plan.id} className="cp-membership-plan">
   <P.Card><P.Stack gap="lg"><P.Stack gap="md"><P.Eyebrow>Membership</P.Eyebrow><P.Heading level={3} size="md">{plan.title}</P.Heading>{plan.description&&<P.Text tone="muted">{plan.description}</P.Text>}</P.Stack>
   {plan.benefits.length>0&&<ul className="cp-membership-benefits" aria-label={`${plan.title} benefits`}>{plan.benefits.map(benefit=><li key={benefit.id}><span className="cp-membership-benefit-mark" aria-hidden="true">✓</span><div><P.Text>{benefit.label}</P.Text>{benefit.description&&<P.Text size="sm" tone="muted">{benefit.description}</P.Text>}</div></li>)}</ul>}
   </P.Stack></P.Card>
  </article>)}</P.Grid></div>:<P.Text tone="muted">{data.cursor?'There are no more available plans in this selection.':'No membership plans are available here yet.'}</P.Text>}
  {(data.cursor||data.nextCursor)&&<nav className="cp-membership-plan-pagination" aria-label="Membership plan pagination">
   <P.Text size="sm" tone="muted">{data.items.length===1?'1 membership':`${data.items.length} memberships`}{data.nextCursor?' · More to explore':''}</P.Text>
   <div>{first&&<P.Link href={first} label="Back to first plans"/>}{next&&<P.Link href={next} label="More memberships →"/>}{!first&&!next&&<P.Text size="sm" tone="muted">Browse all plans on the published website.</P.Text>}</div>
  </nav>}
  {attrs.actionLink&&data.items.length>0&&<footer className="cp-membership-plans-action"><P.Link href={attrs.actionLink} label={attrs.actionLabel||'Ask about membership'}/></footer>}
 </section>;
});
