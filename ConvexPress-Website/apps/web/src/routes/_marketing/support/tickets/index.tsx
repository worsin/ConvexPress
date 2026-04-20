import { createFileRoute, Link, ErrorComponent } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { formatRelativeTime } from "@/lib/format";
import { z } from "zod";
import { Loader2, MessageSquarePlus } from "lucide-react";

const searchSchema = z.object({
  status: z
    .enum(["open", "awaitingResponse", "inProgress", "resolved", "closed"])
    .optional(),
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/support/tickets/")({
  validateSearch: searchSchema,
  component: MyTicketsPage,
  errorComponent: ErrorComponent,
  head: () => ({
    meta: [{ title: "My Tickets - Support" }],
  }),
});

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  awaitingResponse: "Awaiting Response",
  inProgress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

type TicketListItem = {
  _id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  messageCount: number;
  createdAt: number;
  lastMessageAt?: number;
};

function MyTicketsPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const search = Route.useSearch();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const result = useQuery(
    api.tickets.queries.getMyTickets,
    isSignedIn
      ? {
          status: search.status as "open" | "awaitingResponse" | "inProgress" | "resolved" | "closed" | undefined,
          page: search.page,
        }
      : "skip",
  ) as { tickets: TicketListItem[] } | null | undefined;

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">My Tickets</h1>
        <p className="text-foreground/60">
          Please{" "}
          <Link to="/login" className="text-primary hover:underline">
            sign in
          </Link>{" "}
          to view your support tickets.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Tickets</h1>
        <Link
          to="/support/new"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:opacity-90 transition-opacity"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Ticket
        </Link>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {[
          { key: undefined, label: "All" },
          { key: "open", label: "Open" },
          { key: "awaitingResponse", label: "Awaiting" },
          { key: "resolved", label: "Resolved" },
          { key: "closed", label: "Closed" },
        ].map((tab) => (
          <Link
            key={tab.key ?? "all"}
            to="/support/tickets"
            search={{ status: tab.key as "open" | "awaitingResponse" | "inProgress" | "resolved" | "closed" | undefined }}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              (tab.key === undefined ? !search.status : search.status === tab.key)
                ? "border-primary text-primary"
                : "border-transparent text-foreground/60 hover:text-foreground/80"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Ticket List */}
      {result ? (
        <div className="space-y-3">
          {result.tickets.map((ticket) => (
            <Link
              key={ticket._id}
              to="/support/tickets/$ticketId"
              params={{ ticketId: ticket._id }}
              className="block rounded-lg border border-border p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{ticket.subject}</div>
                  <div className="text-xs text-foreground/40 mt-1">
                    {ticket.ticketNumber} &middot;{" "}
                    {formatRelativeTime(ticket.createdAt)}
                  </div>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-foreground/40">
                <span>{ticket.messageCount} messages</span>
                {ticket.lastMessageAt && (
                  <span>
                    Last activity {formatRelativeTime(ticket.lastMessageAt)}
                  </span>
                )}
              </div>
            </Link>
          ))}

          {result.tickets.length === 0 && (
            <div className="text-center py-12 text-foreground/40">
              <p>No tickets found.</p>
              <Link
                to="/support/new"
                className="text-primary hover:underline text-sm mt-2 inline-block"
              >
                Submit your first ticket
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
