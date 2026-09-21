import type {QueryCtx} from '../_generated/server';
import {RequestReadLedger} from '../helpers/requestReadLedger';
import {isPluginEnabled} from '../helpers/plugins';
import {getCurrentUser} from '../helpers/permissions';
import {readMembershipAuthorityGrants} from '../helpers/membershipAuthority';
import {membershipAccessArgsSchema,membershipAccessResultSchema,type MembershipAccessResult} from './foundation/membershipContracts';

/** Describes one active plan and this authenticated viewer's grant. It never
 * loads protected content, role/capability details, or another member's data. */
export async function readMembershipAccess(ctx:QueryCtx,rawArgs:unknown,budget=new RequestReadLedger()):Promise<MembershipAccessResult> {
  const args=membershipAccessArgsSchema.parse(rawArgs);
  if(!await isPluginEnabled(ctx,'membership',budget))return {state:'unavailable',plan:null};
  if(!args.plan)return {state:'unconfigured',plan:null};
  const id=ctx.db.normalizeId('membership_plans',args.plan);
  if(!id)return {state:'unavailable',plan:null};
  budget.beforeRead();const plan=budget.record(await ctx.db.get('membership_plans',id));
  if(!plan || plan.status!=='active')return {state:'unavailable',plan:null};
  const user=await getCurrentUser(ctx,budget);
  const state=!user || user.status!=='active' ? 'signed-out'
    : (await readMembershipAuthorityGrants(ctx,user._id,budget)).some(grant=>grant.planId===id) ? 'granted' : 'missing-plan';
  return membershipAccessResultSchema.parse({state,plan:{id:plan._id,title:plan.title}});
}
