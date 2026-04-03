/**
 * Ticket Detail Route - /admin/tickets/$ticketId
 *
 * Two-column layout: 2/3 message thread + 1/3 sidebar.
 * Thread shows messages chronologically with sender role badges.
 * Admin reply form with reply / internal note toggle.
 * Sidebar: status, priority, category, assignee, tags, SLA info, CSAT rating.
 */

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  ArrowLeft,
  Clock,
  Tag,
  Send,
  Lock,
  Star,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/$ticketId",
)({
  component: TicketDetailPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TicketDetailPage() {
  const { ticketId } = Route.useParams();

  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <TicketDetail ticketId={ticketId} />
    </RoutePermissionGuard>
  );
}

// ─── Detail Component ─────────────────────────────────────────────────────────

function TicketDetail({ ticketId }: { ticketId: string }) {
  const navigate = useNavigate();
  const [replyContent, setReplyContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const data = useQuery(api.tickets.queries.getTicketWithReplies, {
    ticketId: ticketId as Id<"ticket_tickets">,
    includeInternal: true,
  });

  const adminReply = useMutation(api.tickets.mutations.adminReply);
  const updateStatus = useMutation(api.tickets.mutations.updateStatus);
  const updatePriority = useMutation(api.tickets.mutations.updatePriority);

  if (!data) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-black/5 rounded w-1/3" />
        <div className="h-96 bg-black/5 rounded" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="p-6 text-center text-sm text-black/50">
        Ticket not found or you do not have permission to view it.
      </div>
    );
  }

  const { ticket, messages } = data as any;

  async function handleReply() {
    if (!replyContent.trim()) return;
    try {
      await adminReply({
        ticketId: ticketId as Id<"ticket_tickets">,
        content: replyContent,
        isInternal,
      });
      setReplyContent("");
      setIsInternal(false);
      toast.success(isInternal ? "Internal note added" : "Reply sent");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to send reply");
    }
  }

  async function handleStatusChange(newStatus: string) {
    try {
      await updateStatus({
        ticketId: ticketId as Id<"ticket_tickets">,
        status: newStatus as any,
      });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to update status");
    }
  }

  async function handlePriorityChange(newPriority: string) {
    try {
      await updatePriority({
        ticketId: ticketId as Id<"ticket_tickets">,
        priority: newPriority as any,
      });
      toast.success("Priority updated");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to update priority");
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void navigate({ to: "/_authenticated/_admin/tickets/" })}
          className="p-1 rounded hover:bg-black/5"
          aria-label="Back to tickets"
        >
          <ArrowLeft className="h-5 w-5 text-black/50" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <div className="text-sm text-black/50">
            {ticket.ticketNumber} &middot; Opened by {ticket.userNameSnapshot} (
            {ticket.userEmailSnapshot})
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Message Thread (2/3) */}
        <div className="col-span-2 space-y-4">
          {/* Messages */}
          <div className="space-y-3">
            {(messages as any[]).map((msg: any) => (
              <div
                key={msg._id}
                className={`rounded-lg border p-4 ${
                  msg.isInternal
                    ? "border-amber-300/50 bg-amber-50/50"
                    : msg.senderType === "system"
                      ? "border-black/5 bg-black/[0.02]"
                      : msg.senderType === "admin"
                        ? "border-blue-200/50 bg-blue-50/30"
                        : "border-black/10 bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{msg.senderName}</span>
                    {msg.isInternal && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-500/15 px-1.5 py-0.5 rounded">
                        <Lock className="h-3 w-3" /> Internal
                      </span>
                    )}
                    {msg.senderType === "system" && (
                      <span className="text-xs text-black/40 bg-black/5 px-1.5 py-0.5 rounded">
                        System
                      </span>
                    )}
                    {msg.senderType === "admin" && !msg.isInternal && (
                      <span className="text-xs text-blue-700 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        Staff
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-black/40">
                    {formatDate(msg.createdAt)}
                    {msg.editedAt && " (edited)"}
                  </span>
                </div>
                <div className="text-sm text-black/80 whitespace-pre-wrap">
                  {msg.content}
                </div>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {msg.attachments.map((att: any, i: number) => (
                      <span
                        key={i}
                        className="text-xs bg-black/5 px-2 py-1 rounded"
                      >
                        {att.name} ({Math.round(att.size / 1024)}KB)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Reply Box */}
          {ticket.status !== "closed" && (
            <div className="rounded-lg border border-black/10 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsInternal(false)}
                  className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                    !isInternal
                      ? "bg-blue-500/15 text-blue-700"
                      : "text-black/50 hover:text-black/70"
                  }`}
                >
                  Reply
                </button>
                <button
                  onClick={() => setIsInternal(true)}
                  className={`text-sm font-medium px-3 py-1 rounded flex items-center gap-1 transition-colors ${
                    isInternal
                      ? "bg-amber-500/15 text-amber-700"
                      : "text-black/50 hover:text-black/70"
                  }`}
                >
                  <Lock className="h-3 w-3" /> Internal Note
                </button>
              </div>
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={
                  isInternal
                    ? "Add an internal note (not visible to the user)..."
                    : "Type your reply..."
                }
                rows={4}
                className="w-full px-3 py-2 text-sm border border-black/15 rounded-md bg-card resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => void handleReply()}
                  disabled={!replyContent.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-4 w-4" />
                  {isInternal ? "Add Note" : "Send Reply"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-4">
          {/* Status */}
          <div className="rounded-lg border border-black/10 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-black/70">Status</h3>
            <select
              value={ticket.status}
              onChange={(e) => void handleStatusChange(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-black/15 rounded-md bg-card"
            >
              <option value="open">Open</option>
              <option value="awaitingResponse">Awaiting Response</option>
              <option value="inProgress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Priority */}
          <div className="rounded-lg border border-black/10 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-black/70">Priority</h3>
            <select
              value={ticket.priority}
              onChange={(e) => void handlePriorityChange(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-black/15 rounded-md bg-card"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {/* Details */}
          <div className="rounded-lg border border-black/10 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-black/70">Details</h3>
            <div className="text-sm">
              <span className="text-black/50">Category:</span>{" "}
              <span className="text-black/80">{ticket.category}</span>
            </div>
            <div className="text-sm">
              <span className="text-black/50">Source:</span>{" "}
              <span className="text-black/80">{ticket.source}</span>
            </div>
            {ticket.aiAttempted && (
              <div className="text-sm text-purple-700 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                AI deflection attempted
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="rounded-lg border border-black/10 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-black/70 flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" /> Tags
            </h3>
            <div className="flex flex-wrap gap-1">
              {ticket.tags.length > 0 ? (
                ticket.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="text-xs bg-black/5 px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-black/30 italic">No tags</span>
              )}
            </div>
          </div>

          {/* SLA */}
          <div className="rounded-lg border border-black/10 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-black/70 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> SLA
            </h3>
            <div className="text-sm">
              <span className="text-black/50">Created:</span>{" "}
              <span className="text-black/80">
                {formatDate(ticket.createdAt)}
              </span>
            </div>
            {ticket.firstResponseAt ? (
              <div className="text-sm">
                <span className="text-black/50">First response:</span>{" "}
                <span className="text-black/80">
                  {formatDuration(ticket.firstResponseAt - ticket.createdAt)}
                </span>
              </div>
            ) : (
              <div className="text-sm text-orange-600 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Awaiting first response (
                {formatDuration(Date.now() - ticket.createdAt)})
              </div>
            )}
            {ticket.resolvedAt && (
              <div className="text-sm">
                <span className="text-black/50">Resolved in:</span>{" "}
                <span className="text-black/80">
                  {formatDuration(ticket.resolvedAt - ticket.createdAt)}
                </span>
              </div>
            )}
          </div>

          {/* CSAT */}
          {ticket.rating !== undefined && (
            <div className="rounded-lg border border-black/10 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-black/70 flex items-center gap-1">
                <Star className="h-3.5 w-3.5" /> Rating
              </h3>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= ticket.rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-black/15"
                    }`}
                  />
                ))}
                <span className="text-sm text-black/60 ml-1">
                  {ticket.rating}/5
                </span>
              </div>
              {ticket.ratingComment && (
                <p className="text-sm text-black/60 italic">
                  &ldquo;{ticket.ratingComment}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
