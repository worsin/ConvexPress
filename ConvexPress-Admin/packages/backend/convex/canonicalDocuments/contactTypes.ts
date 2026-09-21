import type { Id } from "../_generated/dataModel";

/** Minimal persisted Contact binding. Keep this independent of Doc<"forms">:
 * Convex includes helper exports in ApiFromModules, where expanding the entire
 * schema through a helper parameter creates a recursive API/schema type graph.
 * Optional fields remain optional for ordinary and pre-migration Forms rows. */
export interface ContactFormBinding {
  _id: Id<"forms">;
  fieldGroupId?: Id<"fieldGroups">;
  contactPostId?: Id<"posts">;
  contactBlockId?: string;
  contactDefinition?: string;
  contactNotificationId?: Id<"form_notifications">;
  contactConfirmationId?: Id<"form_confirmations">;
}
