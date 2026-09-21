import type { RequestReadLedger } from "./requestReadLedger";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** All canonical URL aliases whose membership policy protects this document. */
export async function contentMembershipPaths(
  ctx: Pick<QueryCtx, "db">,
  post: Doc<"posts">,
  path?: string,
  budget?: RequestReadLedger,
): Promise<string[]> {
  const paths = new Set([
    post.type === "page"
      ? (post.path ?? `/${post.slug}`)
      : `/blog/${post.slug}`,
    ...(path ? [path] : []),
  ]);
  // The public Website serves pages under /page; editor/policy records may
  // also address their stored path. Both aliases must enforce access.
  if (post.type === "page") {
    paths.add(`/page${post.path ?? `/${encodeURIComponent(post.slug)}`}`);
    budget?.beforeRead();
    const reading = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "reading"))
      .unique();
    budget?.record(reading);
    const values = reading?.values as
      | {
          homepageDisplays?: string;
          homepageId?: string;
          showOnFront?: string;
          pageOnFront?: string;
        }
      | undefined;
    const homeId =
      values?.homepageDisplays === "static_page" && values.homepageId
        ? values.homepageId
        : values?.showOnFront === "page"
          ? values.pageOnFront
          : undefined;
    if (homeId === String(post._id)) paths.add("/");
  }
  if (post.type === "post") paths.add(`/blog/${encodeURIComponent(post.slug)}`);
  return [...paths];
}
