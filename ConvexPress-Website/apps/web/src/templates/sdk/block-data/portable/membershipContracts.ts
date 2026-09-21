import {z} from 'zod';
const plan = z.strictObject({id:z.string().min(1).max(256),title:z.string().min(1).max(512)});
export const membershipAccessArgsSchema = z.strictObject({plan:z.string().min(1).max(256).optional()});
export const membershipAccessResultSchema = z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('unconfigured'),plan:z.null()}),
  z.strictObject({state:z.literal('unavailable'),plan:z.null()}),
  z.strictObject({state:z.literal('signed-out'),plan}),
  z.strictObject({state:z.literal('missing-plan'),plan}),
  z.strictObject({state:z.literal('granted'),plan}),
]);
export type MembershipAccessArgs = z.infer<typeof membershipAccessArgsSchema>;
export type MembershipAccessResult = z.infer<typeof membershipAccessResultSchema>;
export function membershipAccessMatchesArgs(args:MembershipAccessArgs,result:MembershipAccessResult):boolean {
  return result.state==='unconfigured' ? args.plan===undefined : result.plan===null || result.plan.id===args.plan;
}
