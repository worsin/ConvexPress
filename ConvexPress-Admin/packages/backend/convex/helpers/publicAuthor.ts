import type { Doc } from "../_generated/dataModel";

/** Controller principals provide editorial authority, not public author profiles. */
export function isPublicAuthor(
  user: Doc<"users"> | null | undefined,
): user is Doc<"users"> {
  return Boolean(
    user && user.status === "active" &&
    user.authSource !== "management" && user.internalRole !== "management",
  );
}

export function publicAuthorProfile(user: Doc<"users"> | null | undefined) {
  if (!isPublicAuthor(user)) return null;
  return {
    _id: user._id,
    displayName: user.displayName || user.nickname || user.username || "Author",
    bio: user.bio,
    avatarUrl: user.avatarUrl ?? user.profilePictureUrl,
    slug: user.slug,
  };
}
