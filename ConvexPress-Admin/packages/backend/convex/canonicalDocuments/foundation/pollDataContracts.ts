import { z } from "zod";
export const pollArgsSchema = z.strictObject({ blockId: z.string().min(1).max(128) });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const pollSecuritySchema = z.strictObject({
  honeypotEnabled: z.boolean(), honeypotFieldName: z.string().min(1).max(256),
  captchaEnabled: z.boolean(), captchaProvider: z.enum(["none", "turnstile", "hcaptcha", "recaptcha"]),
  captchaSiteKey: z.string().max(1000).nullable(), recaptchaMinScore: z.number().min(0).max(1),
});
export const pollDefaultSecurity = { honeypotEnabled: false, honeypotFieldName: "website_url", captchaEnabled: false, captchaProvider: "none" as const, captchaSiteKey: null, recaptchaMinScore: .5 };
export const pollSnapshotSchema = z.strictObject({
  postId: z.string().min(1).max(256), blockId: z.string().min(1).max(128), definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
  question: z.string().min(1).max(500),
  options: z.array(z.strictObject({ key: z.string().min(1).max(80), label: z.string().min(1).max(240), count: count.nullable() })).min(2).max(12),
  total: count.nullable(), responsePolicy: z.enum(["visitor", "signedIn"]), canVote: z.boolean(), votedKey: z.string().max(80).nullable(),
  asOf: count, nextChangeAt: count.nullable(),
  security: pollSecuritySchema.default(pollDefaultSecurity),
}).superRefine((poll, ctx) => {
  const keys = new Set(poll.options.map(option => option.key));
  if (keys.size !== poll.options.length || (poll.votedKey !== null && !keys.has(poll.votedKey)) || (poll.votedKey !== null && poll.canVote))
    ctx.addIssue({ code: "custom", message: "Invalid poll choices or response state" });
  if (poll.total === null ? poll.options.some(option => option.count !== null) : poll.options.some(option => option.count === null) || poll.options.reduce((sum, option) => sum + (option.count ?? 0), 0) !== poll.total)
    ctx.addIssue({ code: "custom", message: "Poll totals must agree with its disclosure policy and choices" });
});
export const pollResultSchema = z.strictObject({ blockId: z.string().min(1).max(128), poll: pollSnapshotSchema.nullable(), asOf: count, nextChangeAt: count.nullable() });
export type PollArgs = z.infer<typeof pollArgsSchema>;
export type PollResult = z.infer<typeof pollResultSchema>;
export function pollMatchesArgs(args: PollArgs, result: PollResult): boolean {
  return args.blockId === result.blockId && (result.poll === null || result.poll.blockId === args.blockId);
}
