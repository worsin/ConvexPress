import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";

export const Route = createFileRoute("/_marketing/support/new")({
  component: CreateTicketPage,
  head: () => ({
    meta: [{ title: "New Ticket - Support" }],
  }),
});

const CATEGORIES = [
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "account", label: "Account" },
  { value: "featureRequest", label: "Feature Request" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
];

function CreateTicketPage() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [submitting, setSubmitting] = useState(false);

  const createTicket = useMutation(api.tickets.mutations.create);

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">Submit a Ticket</h1>
        <p className="text-foreground/60">
          Please{" "}
          <Link to="/login" className="text-primary hover:underline">
            sign in
          </Link>{" "}
          to submit a support ticket.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const result = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category: category as any,
        source: "dashboard",
      });
      toast.success(`Ticket ${result.ticketNumber} created`);
      navigate({
        to: "/support/tickets/$ticketId",
        params: { ticketId: result.ticketId },
      });
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link
          to="/support"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Support
        </Link>
        <h1 className="text-2xl font-bold">Submit a Ticket</h1>
        <p className="text-sm text-foreground/50 mt-1">
          Describe your issue and our support team will get back to you as soon
          as possible.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of your issue"
            maxLength={200}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-foreground/30 mt-1">
            {subject.length}/200 characters
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please describe your issue in detail. Include any steps to reproduce, expected behavior, and screenshots if applicable."
            rows={8}
            maxLength={10000}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-foreground/30 mt-1">
            {description.length}/10000 characters
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={
              !subject.trim() ||
              subject.trim().length < 5 ||
              !description.trim() ||
              description.trim().length < 10 ||
              submitting
            }
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Submitting..." : "Submit Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
