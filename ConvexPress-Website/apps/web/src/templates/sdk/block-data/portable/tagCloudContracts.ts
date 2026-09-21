import { z } from "zod";

const cursor = z.string().min(1).max(4096).nullable();
export const tagCloudArgsSchema = z.strictObject({
  max: z.number().int().min(1).max(100).default(30),
  cursor: cursor.default(null),
});
const topic = z.strictObject({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  href: z.string().max(2048).regex(/^\/tag\/[^\s/?#\\]+$/u),
});
export const tagCloudResultSchema = z.strictObject({
  items: z.array(topic).max(100), cursor, nextCursor: cursor, resetRequired: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.resetRequired && (!value.cursor || value.items.length || value.nextCursor))
    ctx.addIssue({ code: "custom", path: ["resetRequired"], message: "A changed archive must offer a clean restart" });
  if (new Set(value.items.map(item => item.id)).size !== value.items.length)
    ctx.addIssue({ code: "custom", path: ["items"], message: "Duplicate topic identity" });
  if (value.nextCursor !== null && value.nextCursor === value.cursor)
    ctx.addIssue({ code: "custom", path: ["nextCursor"], message: "Topic pagination must advance" });
});
export type TagCloudArgs = z.infer<typeof tagCloudArgsSchema>;
export type TagCloudResult = z.infer<typeof tagCloudResultSchema>;
export function tagCloudMatchesArgs(args: TagCloudArgs, result: TagCloudResult): boolean {
  return result.cursor === args.cursor && result.items.length <= args.max;
}
