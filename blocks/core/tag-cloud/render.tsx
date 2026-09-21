import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { useBlockPageHref } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/tag-cloud.css";

export default defineDataBlock("core/tag-cloud", "content.tags", ({ attrs, data, blockId }) => {
  const pageHref = useBlockPageHref(blockId);
  const next = data.nextCursor ? pageHref(data.nextCursor) : null;
  const first = data.cursor ? pageHref(null) : null;
  return <P.Stack gap="lg">
    {attrs.heading && <P.Heading level={2} size="md">{attrs.heading}</P.Heading>}
    <nav className="cp-tag-cloud" aria-label={attrs.heading || "Browse topics"}>
      {data.items.length ? <ul className="cp-tag-cloud-topics">
        {data.items.map(topic => <li key={topic.id}><P.Link href={topic.href} label={topic.name} /></li>)}
      </ul> : <P.Text tone="muted">{data.resetRequired ? "These topics have changed. Start again to explore the current collection." : data.nextCursor ? "Continue exploring to find more topics." : data.cursor ? "You’ve reached the end of the topics." : "Topics will appear here when stories are published."}</P.Text>}
    </nav>
    {(data.cursor || data.nextCursor) && <nav className="cp-tag-cloud-pagination" aria-label="Topic pagination">
      {first && <P.Link href={first} label="Back to first topics" />}
      {next && <P.Link href={next} label="More topics →" />}
      {!next && data.nextCursor && <P.Text size="sm" tone="muted">Explore more topics on the published website.</P.Text>}
    </nav>}
  </P.Stack>;
});
