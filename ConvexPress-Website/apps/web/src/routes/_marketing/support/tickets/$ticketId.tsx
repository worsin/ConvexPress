import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";
import { ArrowLeft, Send, Star } from "lucide-react";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

export const Route = createFileRoute(
  "/_marketing/support/tickets/$ticketId",
)({
  component: TicketThreadPage,
  head: () => ({
    meta: [{ title: "Ticket - Support" }],
  }),
});

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TicketThreadPage() {
  const { ticketId } = Route.useParams();
  const { isSignedIn } = useAuth();
  const [replyContent, setReplyContent] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [showRating, setShowRating] = useState(false);

  const data = useQuery(
    api.tickets.queries.getTicketWithReplies,
    isSignedIn
      ? {
          ticketId: ticketId as Id<"ticket_tickets">,
          includeInternal: false,
        }
      : "skip",
  );

  const replyMutation = useMutation(api.tickets.mutations.reply);
  const rateMutation = useMutation(api.tickets.mutations.rate);
  const reopenMutation = useMutation(api.tickets.mutations.reopen);

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p>
          Please{" "}
          <Link to="/login" className="text-primary hover:underline">
            sign in
          </Link>{" "}
          to view this ticket.
        </p>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-muted-foreground">
        Ticket not found or you do not have permission to view it.
      </div>
    );
  }

  const { ticket, messages } = data;

  async function handleReply() {
    if (!replyContent.trim()) return;
    try {
      await replyMutation({
        ticketId: ticketId as Id<"ticket_tickets">,
        content: replyContent,
      });
      setReplyContent("");
      toast.success("Reply sent");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to send reply");
    }
  }

  async function handleRate() {
    if (rating < 1 || rating > 5) return;
    try {
      await rateMutation({
        ticketId: ticketId as Id<"ticket_tickets">,
        rating,
        comment: ratingComment || undefined,
      });
      setShowRating(false);
      toast.success("Thank you for your feedback!");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to submit rating");
    }
  }

  async function handleReopen() {
    try {
      await reopenMutation({
        ticketId: ticketId as Id<"ticket_tickets">,
      });
      toast.success("Ticket reopened");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to reopen ticket");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/support/tickets"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to My Tickets
        </Link>
        <h1 className="text-2xl font-bold">{ticket.subject}</h1>
        <div className="text-sm text-foreground/50 mt-1">
          {ticket.ticketNumber} &middot; {ticket.category} &middot;{" "}
          {ticket.status}
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg) => (
          <div
            key={msg._id}
            className={`rounded-lg border p-4 ${
              msg.senderType === "system"
                ? "border-border/50 bg-muted/30 text-center text-sm text-foreground/50"
                : msg.senderType === "user"
                  ? "border-border bg-card"
                  : "border-primary/20 bg-primary/5"
            }`}
          >
            {msg.senderType !== "system" && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {msg.senderName}
                  {msg.senderType === "admin" && (
                    <span className="text-xs text-primary ml-1">(Support)</span>
                  )}
                </span>
                <span className="text-xs text-foreground/40">
                  {formatDate(msg.createdAt)}
                </span>
              </div>
            )}
            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
      </div>

      {/* Reply Box (visible for open/in-progress tickets only) */}
      {(ticket.status === "open" || ticket.status === "awaitingResponse" || ticket.status === "inProgress") && (
        <div className="space-y-3">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Type your reply..."
            rows={4}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex justify-end">
            <button
              onClick={handleReply}
              disabled={!replyContent.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Send className="h-4 w-4" />
              Send Reply
            </button>
          </div>
        </div>
      )}

      {/* Reopen (for resolved/closed tickets) */}
      {(ticket.status === "resolved" || ticket.status === "closed") && (
        <div className="text-center space-y-3 py-4 border-t border-border">
          <p className="text-sm text-foreground/50">
            This ticket is {ticket.status}. Still need help?
          </p>
          <button
            onClick={handleReopen}
            className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
          >
            Reopen Ticket
          </button>
        </div>
      )}

      {/* CSAT Rating Prompt (for resolved/closed, not yet rated) */}
      {(ticket.status === "resolved" || ticket.status === "closed") &&
        ticket.rating === undefined && (
          <div className="rounded-lg border border-border p-6 text-center space-y-3">
            <h3 className="font-semibold">How was your experience?</h3>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => {
                    setRating(star);
                    setShowRating(true);
                  }}
                  aria-label={`Rate ${star} out of 5 stars`}
                  className="p-1"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= rating
                        ? "fill-warning text-warning"
                        : "text-foreground/15 hover:text-warning/70"
                    }`}
                  />
                </button>
              ))}
            </div>
            {showRating && (
              <>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Any additional feedback? (optional)"
                  rows={2}
                  className="w-full max-w-md mx-auto px-3 py-2 text-sm border border-border rounded-md bg-card"
                />
                <button
                  onClick={handleRate}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:opacity-90 transition-opacity"
                >
                  Submit Rating
                </button>
              </>
            )}
          </div>
        )}

      {/* Already rated */}
      {ticket.rating !== undefined && (
        <div className="rounded-lg border border-border p-4 text-center text-sm text-foreground/50">
          You rated this ticket {ticket.rating}/5. Thank you for your feedback!
        </div>
      )}
    </div>
  );
}
