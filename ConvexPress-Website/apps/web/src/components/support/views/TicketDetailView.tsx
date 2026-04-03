/**
 * Widget Ticket Detail View.
 *
 * Shows a ticket's message thread within the widget.
 * Allows the user to reply directly from the widget.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Send, Loader2, User, Shield } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TicketDetailViewProps {
  ticketId: string;
  onBack: () => void;
}

export function TicketDetailView({
  ticketId,
}: TicketDetailViewProps) {
  const messages = useQuery(api.tickets.messages.getByTicket, {
    ticketId: ticketId as any,
  });
  const replyToTicket = useMutation(api.tickets.mutations.reply);

  const [replyContent, setReplyContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyContent.trim();
    if (!trimmed) return;

    setIsSending(true);
    try {
      await replyToTicket({
        ticketId: ticketId as any,
        content: trimmed,
      });
      setReplyContent("");
      toast.success("Reply sent!");
    } catch (err) {
      console.error("[TicketDetail] Reply failed:", err);
      toast.error("Failed to send reply. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (messages === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message Thread */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No messages yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message: any) => {
              const isUser = message.senderType === "user";
              const isSystem = message.senderType === "system";

              if (isSystem) {
                return (
                  <div
                    key={message._id}
                    className="text-center text-xs text-muted-foreground"
                  >
                    {message.content}
                  </div>
                );
              }

              return (
                <div
                  key={message._id}
                  className={cn(
                    "flex gap-2",
                    isUser ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      isUser
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isUser ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        isUser
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply Input */}
      <form
        onSubmit={handleReply}
        className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3"
      >
        <input
          type="text"
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Type a reply..."
          className={cn(
            "flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !replyContent.trim()}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground",
            "transition-colors hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  );
}
