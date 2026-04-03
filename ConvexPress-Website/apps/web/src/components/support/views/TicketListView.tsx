/**
 * Widget Ticket List View.
 *
 * Shows the authenticated user's recent tickets with status badges.
 * Includes a "New Ticket" button.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  MessageSquare,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketListViewProps {
  onSelectTicket: (ticketId: string) => void;
  onNewTicket: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  open: {
    label: "Open",
    icon: AlertCircle,
    className: "text-yellow-600 bg-yellow-500/10",
  },
  awaitingResponse: {
    label: "Awaiting Reply",
    icon: Clock,
    className: "text-blue-600 bg-blue-500/10",
  },
  inProgress: {
    label: "In Progress",
    icon: Loader2,
    className: "text-purple-600 bg-purple-500/10",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle,
    className: "text-green-600 bg-green-500/10",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle,
    className: "text-muted-foreground bg-muted",
  },
};

export function TicketListView({
  onSelectTicket,
  onNewTicket,
}: TicketListViewProps) {
  const tickets = useQuery(api.support.widget.getRecentTickets, { limit: 10 });

  if (tickets === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* New Ticket Button */}
      <button
        type="button"
        onClick={onNewTicket}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5",
          "text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary",
        )}
      >
        <Plus className="h-4 w-4" />
        New Ticket
      </button>

      {/* Ticket List */}
      {tickets.length === 0 ? (
        <div className="py-6 text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No tickets yet. Create one if you need help!
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => {
            const statusCfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
            const StatusIcon = statusCfg.icon;

            return (
              <button
                key={ticket._id}
                type="button"
                onClick={() => onSelectTicket(ticket._id as string)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left",
                  "transition-colors hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {ticket.ticketNumber}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      statusCfg.className,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground line-clamp-1">
                  {ticket.subject}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ticket.messageCount} message{ticket.messageCount !== 1 ? "s" : ""}
                  {ticket.lastMessageAt && (
                    <>
                      {" "}
                      &middot; Last reply{" "}
                      {formatRelativeTime(ticket.lastMessageAt)}
                    </>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
