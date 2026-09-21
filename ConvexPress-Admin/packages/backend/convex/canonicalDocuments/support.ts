import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";
import type { TicketCtaResult } from "./foundation/supportContracts";

export async function readTicketCta(ctx: QueryCtx, budget = new RequestReadLedger()): Promise<TicketCtaResult> {
  if (!await isPluginEnabled(ctx, "tickets", budget)) return { available: false };
  const access = createMembershipAccessEvaluator(ctx, budget);
  for (const path of ["/support", "/support/new"]) {
    if (!(await access({resourceType:"route",resourceIdOrKey:path})).allowed) return { available: false };
  }
  return { available: true };
}
