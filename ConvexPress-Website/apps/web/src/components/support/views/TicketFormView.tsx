/**
 * Widget Ticket Form View.
 *
 * Creates a new support ticket. When escalated from AI deflection,
 * the subject is pre-filled with the original query and the description
 * includes the AI context.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TicketFormViewProps {
  sessionId: string;
  prefillQuery?: string;
  onSuccess: (ticketId: string) => void;
  onCancel: () => void;
}

export function TicketFormView({
  prefillQuery,
  onSuccess,
  onCancel,
}: TicketFormViewProps) {
  const createTicket = useMutation(api.tickets.tickets.create);

  const [subject, setSubject] = useState(prefillQuery ?? "");
  const [description, setDescription] = useState(
    prefillQuery
      ? `I searched for: "${prefillQuery}"\n\nThe suggested answers didn't resolve my issue.\n\n`
      : "",
  );
  const [category, setCategory] = useState<string>("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();

    if (!trimmedSubject) {
      toast.error("Please enter a subject.");
      return;
    }
    if (!trimmedDescription) {
      toast.error("Please describe your issue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ticketId = await createTicket({
        subject: trimmedSubject,
        description: trimmedDescription,
        category: category as any,
        source: "widget",
        aiAttempted: !!prefillQuery,
        aiQuery: prefillQuery,
      });

      toast.success("Ticket created successfully!");
      onSuccess(ticketId as string);
    } catch (err) {
      console.error("[TicketForm] Create failed:", err);
      toast.error("Failed to create ticket. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      {/* Subject */}
      <div>
        <label
          htmlFor="widget-ticket-subject"
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          Subject
        </label>
        <input
          id="widget-ticket-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of your issue"
          className={cn(
            "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          autoFocus
          required
        />
      </div>

      {/* Category */}
      <div>
        <label
          htmlFor="widget-ticket-category"
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          Category
        </label>
        <select
          id="widget-ticket-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
        >
          <option value="general">General</option>
          <option value="technical">Technical</option>
          <option value="billing">Billing</option>
          <option value="account">Account</option>
          <option value="featureRequest">Feature Request</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="widget-ticket-description"
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          Description
        </label>
        <textarea
          id="widget-ticket-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your issue in detail..."
          rows={5}
          className={cn(
            "w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          required
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5",
            "text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
