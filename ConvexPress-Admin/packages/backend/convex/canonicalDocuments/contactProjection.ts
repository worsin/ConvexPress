import type { ContactFormBinding } from "./contactTypes";
import { contactMessagingMatches } from "./contactMessaging";
import { contactFieldProjection } from "./contactFields";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import type { ContactDefinition } from "./foundation/contactContracts";
import { stableKey } from "./foundation/contracts";

/** Verify saved projection without authoring or impersonating a logged-in editor.
 * Used by public source checks and execution of persisted publication intent. */
export async function contactProjectionMatches(
  ctx: QueryCtx,
  form: Pick<ContactFormBinding, "_id" | "fieldGroupId" | "contactDefinition" | "contactNotificationId" | "contactConfirmationId">,
  attrs: ContactDefinition,
  budget = new RequestReadLedger(),
): Promise<boolean> {
  if (!form.fieldGroupId || form.contactDefinition !== stableKey(attrs)) return false;
  let index = 0;
  // by_group includes menuOrder: saved authoring order, not insertion order.
  for await (const field of ctx.db.query("fieldDefinitions").withIndex("by_group", q => q.eq("groupId", form.fieldGroupId!))) {
    budget.beforeRead(); budget.record(field);
    const source = attrs.fields[index];
    if (!source) return false;
    const expected = contactFieldProjection(source, String(form._id), index++);
    if (Object.entries(expected).some(([key, value]) => field[key as keyof typeof field] !== value)) return false;
    if (field.defaultValue !== undefined || field.conditionalLogic !== undefined || field.parentFieldId !== undefined) return false;
  }
  return index === attrs.fields.length && await contactMessagingMatches(ctx, form, attrs, budget);
}
