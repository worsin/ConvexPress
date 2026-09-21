import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

export default defineDataBlock("support/ticket-cta", "support.form", ({ attrs, data }) => (
  <section className="cp-support-ticket" aria-label="Contact support">
    <div className="cp-support-ticket-copy">
      <P.Eyebrow>A little help, when you need it</P.Eyebrow>
      <P.Heading level={2} size="lg">{attrs.title}</P.Heading>
      {attrs.body && <P.Text tone="muted">{attrs.body}</P.Text>}
    </div>
    <div className="cp-support-ticket-action">
      {data.available ? <>
        <P.Button href="/support/new" label="Contact support" size="lg" />
        <P.Text size="sm" tone="muted">Tell us what you need help with.</P.Text>
      </> : <P.Text tone="muted">Support requests are not available here right now.</P.Text>}
    </div>
  </section>
));
