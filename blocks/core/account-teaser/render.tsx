import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/account-teaser.css';

export default defineDataBlock('core/account-teaser', 'site.viewer', ({attrs, data}) => {
  const signedIn = data.state === 'signed-in';
  const title = (signedIn ? attrs.signedInText : attrs.signedOutText).trim()
    || (signedIn ? 'Your account' : 'Sign in to your account');
  return <div className="cp-account-teaser">
    <div className="cp-account-teaser-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="24" cy="16" r="7"/>
        <path d="M10 40v-3a14 14 0 0 1 28 0v3M6 40h36"/>
      </svg>
    </div>
    <P.Stack gap="sm">
      <P.Eyebrow>{signedIn ? 'Welcome back' : 'Make yourself at home'}</P.Eyebrow>
      <P.Heading level={2} size="md">{title}</P.Heading>
      <P.Text tone="muted">{signedIn
        ? 'Everything you need, together in your account.'
        : 'A place for your details, your preferences, and what comes next.'}</P.Text>
    </P.Stack>
    <div className="cp-account-teaser-action">
      <P.Link href={data.href} label={signedIn ? 'Go to your account →' : 'Sign in →'}/>
    </div>
  </div>;
});
