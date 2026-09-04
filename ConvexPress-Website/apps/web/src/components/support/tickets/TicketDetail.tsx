import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { ArrowLeft, Check, CheckCircle2, RotateCcw, Star } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { STATUS_META, canRate, canReply, explainError, formatDate, relativeTime, type TicketThreadData } from "@/lib/support-tickets";
import { uploadTicketAttachments } from "@/lib/support-tickets-upload";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AgentAvatar, PersonAvatar, PriorityChip, StatusChip } from "@/components/support/tickets/TicketBits";
import { TicketComposer } from "@/components/support/tickets/TicketComposer";
import { TicketThread } from "@/components/support/tickets/TicketThread";

export interface TicketDetailProps {
  ticketNumber: string;
  backHref: string;
  newTicketHref: (prefill: { subject: string; category: string }) => string;
}

/**
 * One ticket: header with status, "your turn" banner, the thread, the
 * composer (Cmd/Ctrl+Enter, attachments), resolve / reopen, a timeline card,
 * and the rating card once it is resolved. Marks the ticket read on open.
 */
export function TicketDetail({ ticketNumber, backHref, newTicketHref }: TicketDetailProps) {
  const settings = useSettings();
  const siteName = settings?.siteTitle;
  const data = useQuery(api.tickets.queries.getMyTicketThread, { ticketNumber }) as TicketThreadData | null | undefined;
  const reply = useMutation(api.tickets.mutations.reply);
  const requestUploadUrl = useMutation(api.tickets.attachments.generateUploadUrl);
  const markRead = useMutation(api.tickets.mutations.markReadByCustomer);
  const resolve = useMutation(api.tickets.mutations.resolveByCustomer);
  const reopen = useMutation(api.tickets.mutations.reopen);
  const rate = useMutation(api.tickets.mutations.rate);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [acting, setActing] = useState<null | "resolve" | "reopen" | "rate">(null);

  // Clear the unread state whenever a new agent reply lands while the page is open.
  const ticketId = data?.ticket._id;
  const unread = data?.ticket.unread;
  const isOwner = data?.ticket.isOwner;
  useEffect(() => {
    if (!ticketId || !unread || !isOwner) return;
    void markRead({ ticketId }).catch(() => {});
  }, [ticketId, unread, isOwner, markRead]);

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-xl font-semibold text-foreground">We couldn't find that ticket</h2>
        <p className="mt-1 text-muted-foreground">It may have been opened by another account.</p>
        <Button className="mt-5" variant="outline" render={<Link to={backHref as "/"} />}>
          Back to tickets
        </Button>
      </div>
    );
  }

  const { ticket, messages, agent, responseWindow } = data;
  const finished = ticket.finished;
  const yours = ticket.waitingOnYou;

  const handleSend = async (content: string, files: File[]) => {
    setSending(true);
    setSendError(null);
    try {
      const attachments = files.length ? await uploadTicketAttachments(requestUploadUrl, files) : undefined;
      const result = (await reply({ ticketId: ticket._id, content, attachments })) as { reopened?: boolean } | undefined;
      if (result?.reopened) toast.success("Ticket reopened", { description: "Your reply went straight back to our team." });
    } catch (err) {
      const message = explainError(err, "Couldn't send. Please try again.");
      setSendError(message);
      throw err;
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async () => {
    setActing("resolve");
    try {
      await resolve({ ticketId: ticket._id });
      toast.success("Marked as resolved", { description: "Glad that's sorted. Reply anytime to reopen." });
    } catch (err) {
      toast.error("Couldn't update the ticket", { description: explainError(err) });
    } finally {
      setActing(null);
    }
  };

  const handleReopen = async () => {
    setActing("reopen");
    try {
      await reopen({ ticketId: ticket._id });
      toast.success("Ticket reopened", { description: "Tell us what's still wrong below." });
    } catch (err) {
      toast.error("Couldn't reopen the ticket", { description: explainError(err) });
    } finally {
      setActing(null);
    }
  };

  const handleRate = async (rating: number, comment: string) => {
    setActing("rate");
    try {
      await rate({ ticketId: ticket._id, rating, comment: comment.trim() || undefined });
      toast.success("Thanks for the feedback");
    } catch (err) {
      toast.error("Couldn't save your rating", { description: explainError(err) });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12" data-slot="ticket-detail">
      <Link to={backHref as "/"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        All tickets
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={ticket.status} />
            <PriorityChip priority={ticket.priority} />
            <span className="text-xs tabular-nums text-muted-foreground">{ticket.ticketNumber}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-foreground">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.categoryLabel}. Opened {formatDate(ticket.createdAt)}. {STATUS_META[ticket.status]?.blurb}
          </p>
        </div>
      </header>

      {yours && (
        <div className="flex items-center gap-3 rounded-2xl border border-warning/45 bg-warning/10 px-4 py-3 text-sm" role="status">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-foreground">
            <b className="font-semibold">We replied and it's your turn.</b> <span className="text-muted-foreground">Answer below, or mark it resolved if you're all set.</span>
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
            <TicketThread messages={messages} viewerName={ticket.viewerName} siteName={siteName} />
          </div>

          {canReply(ticket) ? (
            <TicketComposer
              onSend={handleSend}
              busy={sending}
              error={sendError}
              placeholder={finished ? "Still need help? Replying reopens this ticket." : "Write a reply"}
              hint={finished ? "Replying reopens the ticket." : `A person replies ${responseWindow}.`}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              This ticket is closed. Need more help?{" "}
              <Link to={newTicketHref({ subject: `Re: ${ticket.subject}`, category: ticket.category }) as "/"} className="font-medium text-primary hover:underline">
                Start a new ticket
              </Link>
              .
            </div>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Who's on it</h2>
            <div className="mt-2 flex items-center gap-3">
              {agent ? <PersonAvatar initials={agent.initials} /> : <AgentAvatar />}
              <div>
                <div className="text-sm font-semibold text-foreground">{agent ? `${agent.name}${siteName ? ` from ${siteName}` : ""}` : `${siteName ?? "Our"} support team`}</div>
                <div className="text-xs text-muted-foreground">{agent ? "Assigned to your ticket" : "Next available person picks it up"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Timeline</h2>
            <ol className="mt-2 space-y-2 text-sm">
              <TimelineRow label="Opened" at={ticket.createdAt} done />
              <TimelineRow label="First reply from us" at={ticket.firstResponseAt} done={Boolean(ticket.firstResponseAt)} pendingText={`Expected ${responseWindow}`} />
              <TimelineRow label="Last activity" at={ticket.lastMessageAt ?? ticket.updatedAt} done />
              <TimelineRow label="Resolved" at={ticket.resolvedAt} done={Boolean(ticket.resolvedAt)} pendingText="Not yet" />
              {ticket.closedAt && <TimelineRow label="Closed" at={ticket.closedAt} done />}
            </ol>
          </div>

          {ticket.status !== "closed" && (
            <div className="rounded-2xl border border-border bg-card p-4">
              {!finished ? (
                <>
                  <div className="text-sm font-semibold text-foreground">All sorted?</div>
                  <p className="mt-1 text-xs text-muted-foreground">Mark it resolved and we'll stop working on it. You can reopen it anytime.</p>
                  <Button variant="outline" className="mt-3 w-full" disabled={acting !== null} onClick={() => void handleResolve()}>
                    <CheckCircle2 className="size-4" aria-hidden />
                    Mark as resolved
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-foreground">Still not right?</div>
                  <p className="mt-1 text-xs text-muted-foreground">Reopen and it goes straight back to our team.</p>
                  <Button variant="outline" className="mt-3 w-full" disabled={acting !== null} onClick={() => void handleReopen()}>
                    <RotateCcw className="size-4" aria-hidden />
                    Reopen ticket
                  </Button>
                </>
              )}
            </div>
          )}

          {canRate(ticket) && <RatingCard busy={acting === "rate"} onRate={handleRate} />}
          {typeof ticket.rating === "number" && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <div className="flex items-center gap-1" aria-label={`You rated this ${ticket.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={cn("size-4", n <= (ticket.rating ?? 0) ? "fill-warning text-warning" : "text-border")} aria-hidden />
                ))}
                <span className="ml-2 text-xs text-muted-foreground">Thanks for rating</span>
              </div>
              {ticket.ratingComment && <p className="mt-2 text-xs text-muted-foreground">"{ticket.ratingComment}"</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TimelineRow({ label, at, done, pendingText }: { label: string; at?: number; done: boolean; pendingText?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", done ? "bg-primary" : "border border-border bg-transparent")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{done && at ? `${formatDate(at)}, ${relativeTime(at)}` : (pendingText ?? "")}</span>
      </span>
    </li>
  );
}

function RatingCard({ busy, onRate }: { busy: boolean; onRate: (rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-sm font-semibold text-foreground">How did we do?</div>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            className="rounded p-0.5 outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Star className={cn("size-6 transition-colors", n <= (hover || rating) ? "fill-warning text-warning" : "text-border")} aria-hidden />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything we should know? Optional." rows={2} maxLength={1000} className="mt-3 resize-none text-sm" aria-label="Rating comment" />
          <Button size="sm" className="mt-2 w-full" disabled={busy} onClick={() => onRate(rating, comment)}>
            Send rating
          </Button>
        </>
      )}
    </div>
  );
}
