import { z } from "zod";
import { renderMediaSchema } from "./renderResources";
const identifier = z.string().min(1).max(256);
export const authorArgsSchema = z.strictObject({ userId: identifier.or(z.literal("")).optional(), useCurrentAuthor: z.boolean().default(false) });
export const authorResultSchema = z.strictObject({ author: z.strictObject({
  id: identifier,
  name: z.string().min(1).max(256),
  bio: z.string().max(2000),
  href: z.string().max(2048).regex(/^\/author\/[^/?#]+$/u).nullable(),
  image: renderMediaSchema.nullable(),
}).nullable() });
export type AuthorArgs = z.infer<typeof authorArgsSchema>;
export type AuthorResult = z.infer<typeof authorResultSchema>;
export function authorMatchesArgs(args: AuthorArgs, result: AuthorResult): boolean {
  // Current-author identity comes from the trusted, document-bound host reader.
  return result.author === null || args.useCurrentAuthor || result.author.id === args.userId;
}
