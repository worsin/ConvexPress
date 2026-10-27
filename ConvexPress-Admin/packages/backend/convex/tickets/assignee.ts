/**
 * Who a ticket is assigned to, by name: a ConvexPress user (`assignedTo`), or
 * an agent of an application that works the queue for its own staff
 * (`assignedAgent`, tickets/operator.ts). Every view that names the assignee
 * reads it here, so both kinds read the same everywhere.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type NameFields = { displayName?: string | null; firstName?: string | null; lastName?: string | null; email: string };

/** A user's name as tickets show it: display name, else first and last name, else email. */
export function ticketUserName(user: NameFields): string {
  if (user.displayName) return user.displayName;
  const name = [user.firstName?.trim() ?? "", user.lastName?.trim() ?? ""].filter(Boolean).join(" ");
  return name || user.email;
}

export function isAssigned(ticket: Pick<Doc<"ticket_tickets">, "assignedTo" | "assignedAgent">): boolean {
  return ticket.assignedTo !== undefined || ticket.assignedAgent !== undefined;
}

/**
 * The assignee's name, or null when the ticket is unassigned (or its user is
 * gone). Pass `names` to look each user up once across a list.
 */
export async function assigneeName(
  ctx: Pick<QueryCtx, "db">,
  ticket: Pick<Doc<"ticket_tickets">, "assignedTo" | "assignedAgent">,
  names?: Map<Id<"users">, string | null>,
): Promise<string | null> {
  if (ticket.assignedAgent) return ticket.assignedAgent.name;
  const userId = ticket.assignedTo;
  if (!userId) return null;
  const known = names?.get(userId);
  if (known !== undefined) return known;
  const user = await ctx.db.get("users", userId);
  const name = user ? ticketUserName(user) : null;
  names?.set(userId, name);
  return name;
}
