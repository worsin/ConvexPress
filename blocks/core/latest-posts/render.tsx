import { useSiteTimeZone } from "../../../ConvexPress-Website/apps/web/src/contexts/SiteTimeZoneContext";
import { formatSiteDate } from "../../../ConvexPress-Website/apps/web/src/lib/blog/date";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro, Prose } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/latest-posts.css";

export default defineDataBlock("core/latest-posts", "content.latestPosts", ({attrs,data}) => {
  const timeZone = useSiteTimeZone();
  return (
  <P.Stack gap="lg">
    <Intro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.body} />
    {data.items.length ? <div className="cp-latest-posts-layout"><P.Grid gap="lg">
      {data.items.map(post => <article className="cp-latest-post" key={post.id}>
        {post.image && <div className="cp-latest-post-image"><P.Image media={post.image} aspect="4/3" /></div>}
        <P.Stack gap="md">
          {post.publishedAt !== null && <P.Text size="sm" tone="muted"><time dateTime={new Date(post.publishedAt).toISOString()}>
            {formatSiteDate(post.publishedAt, timeZone)}
          </time></P.Text>}
          <P.Heading level={3} size="md"><P.Link href={post.href} label={post.title || "Untitled post"} /></P.Heading>
          {attrs.showExcerpts && post.excerpt && <Prose text={post.excerpt} />}
          {attrs.showAuthors && post.author && <P.Text size="sm" tone="muted">By {post.author}</P.Text>}
        </P.Stack>
      </article>)}
    </P.Grid></div> : <P.Text tone="muted">No posts to show yet.</P.Text>}
  </P.Stack>
);
});
