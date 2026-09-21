import { useSiteTimeZone } from "../../../ConvexPress-Website/apps/web/src/contexts/SiteTimeZoneContext";
import { formatSiteDate } from "../../../ConvexPress-Website/apps/web/src/lib/blog/date";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { useBlockPageHref } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Prose } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/post-grid.css";

export default defineDataBlock("core/post-grid", "content.posts", ({ attrs, data, blockId }) => {
  const timeZone = useSiteTimeZone();
  const pageHref = useBlockPageHref(blockId);
  const next = data.nextCursor ? pageHref(data.nextCursor) : null;
  const first = data.cursor ? pageHref(null) : null;
  return <div className="cp-post-grid">
    {data.items.length ? <div className="cp-post-grid-layout"><P.Grid gap="lg">
      {data.items.map(post => <article className="cp-post-grid-card" key={post.id}>
        {post.image && <div className="cp-post-grid-image"><P.Image media={post.image} aspect="4/3" /></div>}
        <P.Stack gap="md">
          <P.Text size="sm" tone="muted"><time dateTime={new Date(post.publishedAt).toISOString()}>{formatSiteDate(post.publishedAt, timeZone)}</time></P.Text>
          <P.Heading level={3} size="md"><P.Link href={post.href} label={post.title || "Untitled post"} /></P.Heading>
          {attrs.showExcerpt && post.excerpt && <Prose text={post.excerpt} />}
          {post.author && <P.Text size="sm" tone="muted">By {post.author}</P.Text>}
        </P.Stack>
      </article>)}
    </P.Grid></div> : <div className="cp-post-grid-empty"><P.Text tone="muted">
      {data.nextCursor ? "No matching stories in this part of the archive. Continue to search older posts." : data.cursor ? "You’ve reached the end of these stories." : "No stories match these filters yet."}
    </P.Text></div>}
    {(data.cursor || data.nextCursor) && <nav aria-label="Post grid pagination" className="cp-post-grid-pagination">
      <P.Text size="sm" tone="muted">{data.items.length === 1 ? "1 story" : `${data.items.length} stories`}{data.nextCursor ? " · More to explore" : " · End of collection"}</P.Text>
      <div className="cp-post-grid-actions">
        {first && <P.Link href={first} label="Back to newest" />}
        {next && <P.Link href={next} label={data.items.length ? "Older stories →" : "Continue exploring →"} />}
        {!next && !first && <P.Text size="sm" tone="muted">Explore more pages on the published website.</P.Text>}
      </div>
    </nav>}
  </div>;
});
