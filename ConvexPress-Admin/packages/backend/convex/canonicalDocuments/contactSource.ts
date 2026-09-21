import type { ContactFormBinding } from "./contactTypes";
import { contactProjectionMatches } from "./contactProjection";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { readPublicBlockSource } from "./publicBlockSource";
import { parseContactDefinition } from "./foundation/contactContracts";
import { stableKey } from "./foundation/contracts";

/** Every public Forms route must recheck this source, including resume and the
 * final CAPTCHA mutation. A form ID/token is never a page-access credential. */
export async function contactSourceAllowed(ctx: QueryCtx, form: Pick<ContactFormBinding,"_id"|"fieldGroupId"|"contactPostId"|"contactBlockId"|"contactDefinition"|"contactNotificationId"|"contactConfirmationId">, password?: string, budget = new RequestReadLedger()): Promise<boolean> {
  if(form.contactPostId===undefined && form.contactBlockId===undefined && form.contactDefinition===undefined)return true;
  if(!form.contactPostId || !form.contactBlockId || !form.contactDefinition)return false;
  const source = await readPublicBlockSource(ctx, { postId: form.contactPostId, blockId: form.contactBlockId, blockName: "core/contact-form", plugin: "forms", password }, budget);
  if (!source) return false;
  let attrs;
  try {attrs=parseContactDefinition(source.node.attrs);if(stableKey(attrs)!==form.contactDefinition)return false;}catch{return false;}
  return attrs.fields.length>0 && await contactProjectionMatches(ctx,form,attrs,budget);
}
