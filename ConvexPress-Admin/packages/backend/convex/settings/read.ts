import type { QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { getDefaults, type SettingsSection } from "./defaults";

/** The same section merge used by public settings and current presentation reads. */
export async function readMergedSettingsSection(ctx: QueryCtx, section: SettingsSection, budget?: RequestReadLedger) {
  budget?.beforeRead();
  const doc = await ctx.db.query("settings").withIndex("by_section", q=>q.eq("section",section)).unique();
  budget?.record(doc);
  return {...getDefaults(section), ...(doc?.values as Record<string,unknown> | undefined)};
}
