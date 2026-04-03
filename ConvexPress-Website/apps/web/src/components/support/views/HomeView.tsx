/**
 * Widget Home View.
 *
 * The landing view when the widget opens. Shows:
 *   - Greeting message
 *   - Search input for KB search / AI deflection
 *   - Quick action buttons (My Tickets, New Ticket)
 */

import { useState } from "react";
import { Search, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface HomeViewProps {
  greeting: string;
  onSearch: (query: string) => void;
  onShowTickets: () => void;
  onNewTicket: () => void;
}

export function HomeView({
  greeting,
  onSearch,
  onShowTickets,
  onNewTicket,
}: HomeViewProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      onSearch(trimmed);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Greeting */}
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">{greeting}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Search our help center or create a support ticket.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search for help..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          autoFocus
        />
      </form>

      {/* Quick Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onShowTickets}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border p-3 text-left",
            "transition-colors hover:bg-muted/50",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">My Tickets</p>
            <p className="text-xs text-muted-foreground">
              View your support requests
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onNewTicket}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border p-3 text-left",
            "transition-colors hover:bg-muted/50",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Plus className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">New Ticket</p>
            <p className="text-xs text-muted-foreground">
              Contact our support team
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
