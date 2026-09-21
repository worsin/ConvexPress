import { z } from "zod";
import { formResultSchema } from "./formContracts";

// The block identity is bound by the compiled descriptor, never a form/post ID
// supplied in authored attributes or a visitor request.
export const contactArgsSchema = z.strictObject({ blockId: z.string().min(1).max(128) });
export const contactResultSchema = formResultSchema.extend({ blockId: z.string().min(1).max(128) });
export type ContactArgs = z.infer<typeof contactArgsSchema>;
export type ContactResult = z.infer<typeof contactResultSchema>;
export function contactMatchesArgs(args: ContactArgs, result: ContactResult): boolean {
  return result.blockId === args.blockId;
}
