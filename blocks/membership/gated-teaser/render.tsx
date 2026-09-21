import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/membership.css';
export default defineDataBlock('membership/gated-teaser','membership.access',({attrs,data})=>{
  if(data.state==='unconfigured')return attrs.teaserText ? <P.Text>{attrs.teaserText}</P.Text> : null;
  const granted=data.state==='granted';
  const signIn=data.state==='signed-out';
  return <div className="cp-membership-teaser" data-membership-state={data.state}>
    <P.Card><P.Stack gap="lg">
      <P.Stack gap="sm">
        <P.Eyebrow>{granted ? 'Your membership' : 'A little more, for members'}</P.Eyebrow>
        <P.Heading level={2} size="lg">{data.plan?.title ?? 'Membership unavailable'}</P.Heading>
        {attrs.teaserText&&<P.Text>{attrs.teaserText}</P.Text>}
      </P.Stack>
      <P.Text tone="muted">{granted ? 'Your membership in this plan is active.' : data.state==='unavailable' ? 'This membership is not currently available.' : signIn ? 'Already a member? Sign in to continue.' : 'Explore this membership, or review the plans you already belong to.'}</P.Text>
      {data.plan && <div className="cp-membership-actions">
        {!granted && attrs.upgradeLink && <P.Link href={attrs.upgradeLink} label="Explore membership →"/>}
        <P.Link href={signIn ? '/login?returnTo=%2Fdashboard%2Fmembership' : '/dashboard/membership'} label={signIn ? 'Sign in →' : 'View your membership →'}/>
      </div>}
    </P.Stack></P.Card>
  </div>;
});
