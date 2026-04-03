/**
 * Ticket Queue Route - /admin/tickets
 *
 * Admin ticket queue with filterable list table. Status tabs (All, Open,
 * Awaiting Response, In Progress, Resolved, Closed). Priority/category/assignee
 * filters. Sortable columns with pagination.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { MessageSquare } from "lucide-react";

const ticketSearchSchema = z.object({
  status: z
    .enum(["open", "awaitingResponse", "inProgress", "resolved", "closed"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category: z
    .enum([
      "billing",
      "technical",
      "account",
      "featureRequest",
      "general",
      "other",
    ])
    .optional(),
  assignedTo: z.string().optional(),
  unassigned: z.boolean().optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["createdAt", "updatedAt", "priority", "lastMessageAt"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/tickets/")({
  validateSearch: ticketSearchSchema,
  component: TicketsPage,
});

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  awaitingResponse: "Awaiting Response",
  inProgress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  featureRequest: "Feature Request",
  general: "General",
  other: "Other",
};

// ─── Badges ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    open: "bg-primary/15 text-primary",
    awaitingResponse: "bg-muted text-muted-foreground",
    inProgress: "bg-accent/15 text-accent-foreground",
    resolved: "bg-success/15 text-success",
    closed: "bg-foreground/10 text-foreground/60",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[status] ?? "bg-foreground/10 text-foreground/60"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-primary/15 text-primary",
    high: "bg-warning/15 text-warning",
    urgent: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[priority] ?? "bg-muted text-muted-foreground"}`}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TicketsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <TicketListTable />
    </RoutePermissionGuard>
  );
}

// ─── List Table ───────────────────────────────────────────────────────────────

function TicketListTable() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(search.search ?? "");

  const result = useQuery(api.tickets.queries.getQueue, {
    status: search.status,
    priority: search.priority,
    category: search.category,
    assignedTo: search.assignedTo as Id<"users"> | undefined,
    unassigned: search.unassigned,
    search: search.search,
    orderBy: search.orderBy,
    orderDir: search.orderDir,
    page: search.page,
    perPage: search.perPage,
  });

  const stats = useQuery(api.tickets.queries.getStats);

  if (result === undefined) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (result === null) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You don&apos;t have permission to view tickets.
      </div>
    );
  }

  type TicketCounts = { open: number; awaitingResponse: number; inProgress: number; resolved: number; closed: number };
  const counts = stats?.counts as TicketCounts | undefined;
  const totalAll = counts
    ? Object.values(counts).reduce((a, b) => a + b, 0)
    : undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support Tickets</h1>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: undefined, label: "All", count: totalAll },
          { key: "open", label: "Open", count: counts?.open },
          { key: "awaitingResponse", label: "Awaiting", count: counts?.awaitingResponse },
          { key: "inProgress", label: "In Progress", count: counts?.inProgress },
          { key: "resolved", label: "Resolved", count: counts?.resolved },
          { key: "closed", label: "Closed", count: counts?.closed },
        ].map((tab) => (
          <button
            key={tab.key ?? "all"}
            onClick={() =>
              void navigate({
                search: { ...search, status: tab.key as typeof search.status, page: 1 },
              })
            }
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              search.status === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 text-xs text-foreground/40">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters Row */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search tickets..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            void navigate({
              search: {
                ...search,
                search: e.target.value || undefined,
                page: 1,
              },
            });
          }}
          className="flex-1 min-w-[12rem] max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        <select
          value={search.priority ?? ""}
          onChange={(e) =>
            void navigate({
              search: {
                ...search,
                priority: (e.target.value || undefined) as typeof search.priority,
                page: 1,
              },
            })
          }
          className="px-3 py-1.5 text-sm border border-border rounded-md bg-card"
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={search.category ?? ""}
          onChange={(e) =>
            void navigate({
              search: {
                ...search,
                category: (e.target.value || undefined) as typeof search.category,
                page: 1,
              },
            })
          }
          className="px-3 py-1.5 text-sm border border-border rounded-md bg-card"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Ticket
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Priority
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Assignee
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Submitted
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Last Activity
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border/50">
            {result.tickets.map((ticket) => (
              <tr
                key={ticket._id}
                onClick={() =>
                  void navigate({
                    to: "/tickets/$ticketId",
                    params: { ticketId: ticket._id },
                  })
                }
                className="hover:bg-muted/30 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-foreground truncate max-w-xs">
                      {ticket.subject}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {ticket.ticketNumber} &middot; {ticket.userNameSnapshot}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {ticket.assigneeName ?? (
                    <span className="text-foreground/30 italic">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {formatTimeAgo(ticket.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    <span>{ticket.messageCount}</span>
                    {ticket.lastMessageAt && (
                      <span className="text-foreground/30 ml-1">
                        &middot; {formatTimeAgo(ticket.lastMessageAt)}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {result.tickets.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No tickets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(result.page - 1) * result.perPage + 1}&ndash;
            {Math.min(result.page * result.perPage, result.total)} of{" "}
            {result.total}
          </span>
          <div className="flex gap-1">
            <button
              disabled={result.page <= 1}
              onClick={() =>
                void navigate({
                  search: { ...search, page: result.page - 1 },
                })
              }
              className="px-3 py-1 rounded border border-border disabled:opacity-30"
            >
              Previous
            </button>
            <button
              disabled={result.page >= result.totalPages}
              onClick={() =>
                void navigate({
                  search: { ...search, page: result.page + 1 },
                })
              }
              className="px-3 py-1 rounded border border-border disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
