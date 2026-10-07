import type { QueryCtx } from "../_generated/server";
import { publicAuthorProfile } from "../helpers/publicAuthor";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { evaluateMembershipAccess } from "../membership/access";
import { authorArgsSchema, authorResultSchema, type AuthorResult } from "./foundation/authorContracts";

/** One exact site author. Account roles, email and credentials never enter the DTO. */
export async function readAuthor(ctx: QueryCtx, input: unknown, budget = new RequestReadLedger(), currentDocumentId?: string): Promise<AuthorResult> {
  const args = authorArgsSchema.parse(input);
  let id = args.userId ? ctx.db.normalizeId("users", args.userId) : null;
  if (args.useCurrentAuthor) {
    // Only the already-authorized host supplies this document identity.
    const postId = currentDocumentId ? ctx.db.normalizeId("posts", currentDocumentId) : null;
    if (!postId) return { author: null };
    budget.beforeRead();
    id = budget.record(await ctx.db.get("posts", postId))?.authorId ?? null;
  }
  if (!id) return { author: null };
  budget.beforeRead();
  const user = budget.record(await ctx.db.get("users", id));
  const profile = publicAuthorProfile(user);
  if (!profile || !user) return { author: null };
  const href = profile.slug ? `/author/${encodeURIComponent(profile.slug)}` : null;
  if (href && !(await evaluateMembershipAccess(ctx, {resourceType:"route",resourceIdOrKey:href}, budget)).allowed) return { author: null };
  const name = [user.displayName, user.nickname, user.username].find(value => value?.trim() && !value.includes("@"))?.trim().slice(0,256) || "Author";
  let image: NonNullable<AuthorResult["author"]>["image"] = null;
  if (user.avatarMediaId) {
    budget.beforeRead();
    const media = budget.record(await ctx.db.get("media", user.avatarMediaId));
    if (media?.status === "active" && media.mediaType === "image" && media.mimeType.startsWith("image/")) {
      let src: string | undefined = media.url;
      if (media.storageId) { budget.beforeRead(); src = await ctx.storage.getUrl(media.storageId) ?? undefined; }
      if (src) image = { src, alt: name };
    }
  } else if (profile.avatarUrl) image = { src: profile.avatarUrl, alt: name };
  const safeImage = authorResultSchema.shape.author.unwrap().shape.image.safeParse(image);
  return authorResultSchema.parse({author:{id:user._id,name,bio:profile.bio?.trim().slice(0,2000) || "",href,image:safeImage.success ? safeImage.data : null}});
}
