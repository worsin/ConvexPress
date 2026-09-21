import {z} from 'zod';
const id=z.string().min(1).max(256),cursor=z.string().min(1).max(4096).nullable();
export const membershipPlansArgsSchema=z.strictObject({
 selection:z.enum(['all','selected']).default('all'),plans:z.array(id).max(12).default([]),
 limit:z.number().int().min(1).max(12).default(6),cursor:cursor.default(null),
}).superRefine((args,ctx)=>{if(new Set(args.plans).size!==args.plans.length)ctx.addIssue({code:'custom',path:['plans'],message:'Select each membership plan only once'});});
export const publicMembershipPlanSchema=z.strictObject({
 id,title:z.string().min(1).max(512),description:z.string().max(4000),
 benefits:z.array(z.strictObject({id,label:z.string().min(1).max(512),description:z.string().max(2000)})).max(64),
}).superRefine((plan,ctx)=>{if(new Set(plan.benefits.map(b=>b.id)).size!==plan.benefits.length)ctx.addIssue({code:'custom',path:['benefits'],message:'Duplicate membership benefit'});});
export const membershipPlansResultSchema=z.strictObject({items:z.array(publicMembershipPlanSchema).max(12),cursor,nextCursor:cursor}).superRefine((data,ctx)=>{
 if(new Set(data.items.map(p=>p.id)).size!==data.items.length)ctx.addIssue({code:'custom',path:['items'],message:'Duplicate membership plan'});
 if(data.nextCursor!==null&&data.nextCursor===data.cursor)ctx.addIssue({code:'custom',path:['nextCursor'],message:'Membership pagination must advance'});
});
export type MembershipPlansArgs=z.infer<typeof membershipPlansArgsSchema>;
export type MembershipPlansResult=z.infer<typeof membershipPlansResultSchema>;
export type PublicMembershipPlan=z.infer<typeof publicMembershipPlanSchema>;
export function membershipPlansMatchArgs(args:MembershipPlansArgs,result:MembershipPlansResult):boolean{
 if(result.cursor!==args.cursor||result.items.length>args.limit)return false;
 if(args.selection==='all')return true;
 let previous=-1;
 return result.items.every(item=>{const position=args.plans.indexOf(item.id);if(position<=previous)return false;previous=position;return true;});
}
