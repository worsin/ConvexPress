import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { ArrowLeft, BookOpen, Check, Loader2, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { useSessionId } from "@/components/support/hooks/useSessionId";
import {
  DESCRIPTION_MAX,
  SUBJECT_MAX,
  categoryExamples,
  categoryHint,
  categoryLabel,
  explainError,
  sortCategories,
  validateTicketDraft,
  type TicketCategoriesResult,
  type TicketDraftErrors,
} from "@/lib/support-tickets";
import { uploadTicketAttachments } from "@/lib/support-tickets-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AgentAvatar } from "@/components/support/tickets/TicketBits";
import { AttachmentPicker, useAttachmentSelection } from "@/components/support/tickets/TicketComposer";

export interface NewTicketPrefill {
  subject?: string;
  category?: string;
  context?: string;
}

export interface NewTicketFormProps {
  prefill?: NewTicketPrefill;
  /** Where "Cancel" and the back arrow go. */
  backHref: string;
  /** Builds the href of the created ticket. */
  ticketHref: (ticketNumber: string) => string;
  compactHeader?: boolean;
}

interface KbSuggestion {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  categorySlug?: string | null;
}

interface AiAnswer {
  answer: string;
  sourceArticles: Array<{ id: string; title: string; excerpt: string; slug: string }>;
  confidence: "high" | "medium" | "low" | "none";
  usedAi: boolean;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * New ticket: category picker with the response-window promise per
 * category, subject and description with validation, attachments, KB
 * article suggestions as the subject is typed, and (when support.ai is on)
 * an optional AI answer before the ticket is sent.
 */
export function NewTicketForm({ prefill, backHref, ticketHref, compactHeader = false }: NewTicketFormProps) {
  const navigate = useNavigate();
  const settings = useSettings();
  const kbEnabled = isPublicPluginEnabled("kb", settings);
  const categoriesResult = useQuery(api.tickets.queries.getCustomerCategories, {}) as TicketCategoriesResult | null | undefined;
  const widgetConfig = useQuery(api.support.widget.getConfig, {}) as { aiEnabled?: boolean } | null | undefined;
  const aiEnabled = widgetConfig?.aiEnabled === true;
  const createTicket = useMutation(api.tickets.mutations.create);
  const requestUploadUrl = useMutation(api.tickets.attachments.generateUploadUrl);
  const generateAnswer = useAction(api.support.deflection.generateAnswer);
  const logInteraction = useMutation(api.support.deflection.logInteraction);
  const sessionId = useSessionId();

  const categories = useMemo(() => sortCategories(categoriesResult?.categories ?? []), [categoriesResult]);
  const [category, setCategory] = useState<string>(prefill?.category ?? "");
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [description, setDescription] = useState(prefill?.context ? `\n\n---\n${prefill.context}` : "");
  const attachments = useAttachmentSelection();
  const [fieldErrors, setFieldErrors] = useState<TicketDraftErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // AI answer state
  const [aiResult, setAiResult] = useState<AiAnswer | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);
  const aiTriedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0].value);
  }, [categories, category]);

  const debouncedSubject = useDebounced(subject.trim(), 350);
  const suggestions = useQuery(
    api.kb.search.search,
    kbEnabled && debouncedSubject.length >= 4 ? { query: debouncedSubject, limit: 4 } : "skip",
  ) as { results: KbSuggestion[] } | null | undefined;
  const suggested = suggestions?.results ?? [];

  const selected = categories.find((c) => c.value === category);
  const responseWindow = selected?.responseWindow ?? "as soon as we can";

  const askAssistant = async () => {
    if (!aiEnabled || !sessionId) return;
    const question = `${subject.trim()}\n\n${description.trim()}`.trim();
    if (question.length < 10) return;
    aiTriedFor.current = question;
    setAiLoading(true);
    setAiDismissed(false);
    try {
      const res = (await generateAnswer({ query: question.slice(0, 1000), sessionId })) as AiAnswer;
      setAiResult(res);
    } catch (err) {
      toast.error("The assistant couldn't answer right now", { description: explainError(err, "You can still send the ticket.") });
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  };

  const logAi = async (outcome: "helpful" | "notHelpful" | "escalated", ticketId?: string) => {
    if (!aiResult || !sessionId || !aiTriedFor.current) return;
    try {
      await logInteraction({
        sessionId,
        query: aiTriedFor.current.slice(0, 1000),
        aiResponse: aiResult.answer,
        kbArticleIds: aiResult.sourceArticles.map((a) => a.id),
        outcome,
        ticketId,
        responseLatencyMs: 0,
      });
    } catch {
      // analytics only
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validation = validateTicketDraft({ subject, description });
    setFieldErrors(validation.fieldErrors);
    setError(null);
    if (Object.keys(validation.fieldErrors).length > 0) return;
    if (!category) {
      setError("Pick a category first.");
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = attachments.files.length ? await uploadTicketAttachments(requestUploadUrl, attachments.files) : undefined;
      const result = (await createTicket({
        subject: validation.values.subject,
        description: validation.values.description,
        category,
        source: "dashboard",
        attachments: uploaded,
        aiAttempted: Boolean(aiResult),
        aiQuery: aiResult ? aiTriedFor.current?.slice(0, 1000) : undefined,
        aiResponse: aiResult?.answer,
        kbArticlesShown: [...new Set([...suggested.map((s) => s._id), ...(aiResult?.sourceArticles.map((a) => a.id) ?? [])])],
      })) as { ticketId: string; ticketNumber: string };
      if (aiResult) void logAi("escalated", result.ticketId);
      toast.success("Ticket opened", { description: `${result.ticketNumber}. We'll email you when we reply.` });
      void navigate({ to: ticketHref(result.ticketNumber) } as never);
    } catch (err) {
      setError(explainError(err));
      setSubmitting(false);
    }
  };

  const describedBy = fieldErrors.description ? "ticket-description-error" : "ticket-description-help";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12" data-slot="new-ticket-form">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to tickets" render={<Link to={backHref as "/"} />}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          {!compactHeader && <h1 className="text-2xl font-bold tracking-tight text-foreground">Open a ticket</h1>}
          <p className="text-sm text-muted-foreground">Tell us what's going on. A person on our team picks it up and replies in the thread and by email.</p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[15px] font-bold text-foreground">What is this about?</h2>
            {categoriesResult === undefined ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-busy="true">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : (
              <div role="radiogroup" aria-label="Category" className="mt-3 grid gap-2 sm:grid-cols-2">
                {categories.map((c) => {
                  const on = category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setCategory(c.value)}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 text-left outline-hidden transition-[border-color,background-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        on ? "border-primary bg-primary/6 shadow-sm ring-1 ring-primary/30" : "border-border hover:border-foreground/30 hover:bg-muted/40",
                      )}
                    >
                      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="size-3" strokeWidth={3} aria-hidden />}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{categoryLabel(c.value, c.label)}</span>
                        <span className="block text-xs text-muted-foreground">{categoryHint(c.value) ?? `A person replies ${c.responseWindow}.`}</span>
                        <span className="mt-1 block text-[11px] font-medium text-primary">Reply {c.responseWindow}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setFieldErrors((f) => ({ ...f, subject: undefined }));
                }}
                placeholder="One line that says what's wrong"
                maxLength={SUBJECT_MAX}
                aria-invalid={Boolean(fieldErrors.subject)}
                aria-describedby={fieldErrors.subject ? "ticket-subject-error" : undefined}
                required
              />
              {fieldErrors.subject && (
                <p id="ticket-subject-error" role="alert" className="text-xs text-destructive">
                  {fieldErrors.subject}
                </p>
              )}
            </div>

            {kbEnabled && suggested.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/40 p-3" aria-live="polite">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <BookOpen className="size-3.5" aria-hidden />
                  These might answer it faster
                </div>
                <ul className="mt-2 space-y-1">
                  {suggested.map((s) => (
                    <li key={s._id}>
                      <Link to={`/help/${s.slug}` as "/"} target="_blank" rel="noopener" className="group flex items-start gap-2 rounded-lg p-1.5 text-sm transition-colors hover:bg-card">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-foreground group-hover:text-primary">{s.title}</span>
                          {s.excerpt && <span className="line-clamp-1 block text-xs text-muted-foreground">{s.excerpt}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ticket-description">What happened?</Label>
              <Textarea
                id="ticket-description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setFieldErrors((f) => ({ ...f, description: undefined }));
                }}
                placeholder={`What you were doing, what you expected, and what you saw instead. ${categoryExamples(category)}`}
                rows={7}
                maxLength={DESCRIPTION_MAX}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={describedBy}
                className="resize-y"
                required
              />
              <div className="flex justify-between gap-3 text-xs">
                {fieldErrors.description ? (
                  <p id="ticket-description-error" role="alert" className="text-destructive">
                    {fieldErrors.description}
                  </p>
                ) : (
                  <p id="ticket-description-help" className="text-muted-foreground">
                    {categoryExamples(category)}
                  </p>
                )}
                <span className={cn("shrink-0 tabular-nums", description.length > DESCRIPTION_MAX ? "text-destructive" : "text-muted-foreground/70")}>
                  {description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Screenshots or files</Label>
              <AttachmentPicker
                files={attachments.files}
                onFilesChange={attachments.setFiles}
                problem={attachments.problem}
                onProblemChange={attachments.setProblem}
                disabled={submitting}
                buttonVariant="outline"
                hint="PNG, JPG, WebP, GIF, PDF or text, up to 10 MB each. A screenshot of the error saves a round trip."
              />
            </div>
          </section>

          {aiEnabled && (
            <section className="rounded-2xl border border-border bg-card p-5" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <Sparkles className="size-4" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-bold text-foreground">Try an instant answer first</h2>
                    <p className="text-xs text-muted-foreground">Optional. The assistant reads the help center and answers in seconds. Not helpful? Send the ticket anyway.</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={aiLoading || !sessionId || `${subject}${description}`.trim().length < 10} onClick={() => void askAssistant()}>
                  {aiLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                  {aiResult ? "Ask again" : "Ask the assistant"}
                </Button>
              </div>
              {aiResult && !aiDismissed && (
                <div className="mt-4 rounded-xl border border-secondary bg-secondary/30 p-4">
                  {aiResult.usedAi && aiResult.answer ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{aiResult.answer}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No instant answer for this one. These articles are the closest match:</p>
                  )}
                  {aiResult.sourceArticles.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {aiResult.sourceArticles.map((a) => (
                        <li key={a.id}>
                          <Link to={`/help/${a.slug}` as "/"} target="_blank" rel="noopener" className="text-sm font-medium text-primary hover:underline">
                            {a.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void logAi("helpful");
                        toast.success("Glad that helped");
                        setAiDismissed(true);
                      }}
                    >
                      <ThumbsUp className="size-4" aria-hidden />
                      That solved it
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAiDismissed(true)}>
                      <ThumbsDown className="size-4" aria-hidden />
                      Still need a person
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" render={<Link to={backHref as "/"} />}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {submitting ? "Sending" : "Send ticket"}
            </Button>
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2.5">
              <AgentAvatar size="sm" />
              <span className="text-[15px] font-bold text-foreground">What happens next</span>
            </div>
            <ol className="mt-3 space-y-2.5 text-sm text-foreground">
              <li className="flex gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">1</span>
                <span>
                  You get a ticket number right away. <span className="text-muted-foreground">Come back anytime from Support tickets.</span>
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">2</span>
                <span>
                  A person replies {responseWindow}. <span className="text-muted-foreground">You'll get an email too.</span>
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">3</span>
                <span>
                  The whole conversation stays in one thread. <span className="text-muted-foreground">Reply there, attach files, and mark it resolved when you're set.</span>
                </span>
              </li>
            </ol>
          </div>
          {kbEnabled && (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="font-semibold text-foreground">Faster answers</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Many questions are covered in the{" "}
                <Link to="/help" className="font-medium text-primary hover:underline">
                  help center
                </Link>
                . A ticket is best when something is wrong with your account or order.
              </p>
            </div>
          )}
        </aside>
      </form>
    </div>
  );
}
