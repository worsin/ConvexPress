import type { ContactFormBinding } from "./contactTypes";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";
type ContactMessagingDefinition = { recipientEmail: string; successMessage: string };

// Success copy is plain text in the block contract. Encode braces too so a
// literal example such as {field:email} cannot become a merge-tag expression.
export function contactSuccessHtml(message: string): string {
  const escaped = (message.trim() || "Thank you. Your message has been received.").replace(/[&<>"'{}]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "{": "&#123;", "}": "&#125;" })[char]!);
  return `<p>${escaped.replace(/\r?\n/g, "<br>")}</p>`;
}
function projection(formId: Id<"forms">, attrs: ContactMessagingDefinition) {
  return {
    notification: { formId, name: "Contact message", channel: "email" as const, recipientType: "admin" as const,
      toExpression: attrs.recipientEmail, subjectTemplate: "New {form:title} message", messageTemplate: "<p>A new contact message was received.</p>{all_fields}",
      triggerEventCode: "form.submitted", conditionalLogic: undefined, order: 0 },
    confirmation: { formId, name: "Contact confirmation", type: "message" as const, content: contactSuccessHtml(attrs.successMessage),
      redirectUrl: undefined, pageId: undefined, conditionalLogic: undefined, isDefault: true, order: 0 },
  };
}
type ContactMessagingForm = Pick<ContactFormBinding, "_id" | "contactNotificationId" | "contactConfirmationId">;
export async function syncContactMessaging(ctx: MutationCtx, form: ContactMessagingForm, attrs: ContactMessagingDefinition, userId: Id<"users">, budget: RequestReadLedger): Promise<void> {
  const values = projection(form._id, attrs), now = Date.now();
  budget.beforeRead(); const notification = form.contactNotificationId ? budget.record(await ctx.db.get("form_notifications", form.contactNotificationId)) : null;
  budget.beforeRead(); const confirmation = form.contactConfirmationId ? budget.record(await ctx.db.get("form_confirmations", form.contactConfirmationId)) : null;
  if ((notification && notification.formId !== form._id) || (confirmation && confirmation.formId !== form._id))
    throw new ConvexError({ code: "CONTACT_FORM_CONFIGURATION", message: "Contact messaging belongs to a different form." });
  const contactNotificationId = notification?._id ?? await ctx.db.insert("form_notifications", { ...values.notification, enabled: true });
  if (notification) await ctx.db.patch("form_notifications", notification._id, values.notification); // Preserve administrator enabled/disabled preference.
  const contactConfirmationId = confirmation?._id ?? await ctx.db.insert("form_confirmations", { ...values.confirmation, createdBy: userId, updatedBy: userId, createdAt: now, updatedAt: now });
  if (confirmation) await ctx.db.patch("form_confirmations", confirmation._id, { ...values.confirmation, updatedBy: userId, updatedAt: now });
  await ctx.db.patch("forms", form._id, { contactNotificationId, contactConfirmationId });
}
export async function contactMessagingMatches(ctx: QueryCtx, form: ContactMessagingForm, attrs: ContactMessagingDefinition, budget: RequestReadLedger): Promise<boolean> {
  if (!form.contactNotificationId || !form.contactConfirmationId) return false;
  const values = projection(form._id, attrs);
  budget.beforeRead(); const notification = budget.record(await ctx.db.get("form_notifications", form.contactNotificationId));
  budget.beforeRead(); const confirmation = budget.record(await ctx.db.get("form_confirmations", form.contactConfirmationId));
  if (!notification || !confirmation) return false;
  return Object.entries(values.notification).every(([key, value]) => notification[key as keyof typeof notification] === value) &&
    Object.entries(values.confirmation).every(([key, value]) => confirmation[key as keyof typeof confirmation] === value);
}
