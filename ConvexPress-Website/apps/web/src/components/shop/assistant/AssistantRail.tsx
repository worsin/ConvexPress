/**
 * The assistant rail: brief for the current page, the conversation, what the
 * assistant remembers, and the composer. Rendered as a sidebar on desktop
 * and inside a bottom sheet on phones.
 */

import { Sparkles, Send, ThumbsDown, ThumbsUp, Trash2, X, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { cn } from "@/lib/utils";
import { AssistantBlocks } from "./AssistantBlocks";
import { useAssistant, type BriefKind } from "./useAssistant";
import { usePendingAssistantPrompt } from "./prompt-handoff";

export interface AssistantRailProps {
  kind: BriefKind | "catalog" | "checkout" | "search";
  query?: string;
  productId?: string;
  active: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
  /** A prompt handed in from elsewhere (product page "ask about this", chips). */
  pendingPrompt?: string | null;
  onPromptConsumed?: () => void;
  className?: string;
}

export function AssistantRail({
  kind,
  query,
  productId,
  active,
  onClose,
  onNavigate,
  pendingPrompt,
  onPromptConsumed,
  className,
}: AssistantRailProps) {
  const config = useAssistantConfig();
  const assistant = useAssistant({ kind, query, productId, active });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  usePendingAssistantPrompt({ active, ready: !!assistant.sessionToken && assistant.ready,
    sending: assistant.sending, prompt: pendingPrompt, send: assistant.send, consumed: onPromptConsumed });

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [assistant.messages.length, assistant.pendingText, assistant.brief.blocks.length]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void assistant.send(text);
  };

  const ask = (prompt: string) => {
    void assistant.send(prompt);
  };

  const hasThread = assistant.messages.length > 0 || assistant.pendingText;
  const starters = config.promptChips === "off" ? [] : config.promptChips === "curated" ? config.curatedPrompts : config.starterPrompts;

  return (
    <section
      aria-label={config.displayName}
      className={cn("flex h-full min-h-0 flex-col bg-card text-foreground", className)}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{config.displayName}</h2>
            <p className="truncate text-[11px] text-muted-foreground">{config.tagline}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasThread && (
            <button
              type="button"
              onClick={assistant.clear}
              aria-label="Clear conversation"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${config.displayName}`}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* Brief */}
        {(assistant.brief.loading || assistant.brief.blocks.length > 0) && (
          <section className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                {query ? "Based on your search and cart" : kind === "product" ? "Goes with this" : "Based on your cart"}
              </span>
              {assistant.brief.loading && <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />}
            </div>
            {assistant.brief.blocks.length ? (
              <AssistantBlocks
                blocks={assistant.brief.blocks}
                cardById={assistant.cardById}
                onAsk={ask}
                onNavigate={onNavigate}
                onTrack={(event, ids, groupKey) => assistant.track("rail", event, ids, groupKey)}
                compact
              />
            ) : (
              <div className="space-y-2">
                <div className="h-3 w-4/5 animate-pulse rounded bg-primary/15" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-primary/15" />
                <div className="h-16 animate-pulse rounded-md bg-primary/10" />
              </div>
            )}
          </section>
        )}

        {/* Idle starters */}
        {!hasThread && !assistant.brief.loading && assistant.brief.blocks.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ask about fit, compatibility, or what to buy first.</p>
            {starters.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {starters.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => ask(prompt)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Thread */}
        <ol className="space-y-4">
          {assistant.messages.map((message) => (
            <li key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              {message.role === "user" ? (
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-muted px-3.5 py-2 text-sm text-foreground">{message.text}</p>
              ) : (
                <div className="w-full space-y-2">
                  <AssistantBlocks
                    blocks={message.blocks}
                    cardById={assistant.cardById}
                    onAsk={ask}
                    onNavigate={onNavigate}
                    onTrack={(event, ids, groupKey) => assistant.track("rail", event, ids, groupKey)}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Helpful"
                      aria-pressed={message.feedback === "up"}
                      onClick={() => assistant.feedback(message.id, message.feedback === "up" ? null : "up")}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        message.feedback === "up" && "bg-primary/10 text-primary",
                      )}
                    >
                      <ThumbsUp className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Not helpful"
                      aria-pressed={message.feedback === "down"}
                      onClick={() => assistant.feedback(message.id, message.feedback === "down" ? null : "down")}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        message.feedback === "down" && "bg-muted text-foreground",
                      )}
                    >
                      <ThumbsDown className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {assistant.pendingText && (
            <li className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-muted px-3.5 py-2 text-sm text-foreground">{assistant.pendingText}</p>
            </li>
          )}
          {assistant.sending && (
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Checking your cart and the catalog…
            </li>
          )}
        </ol>
      </div>

      {/* Memory */}
      {config.memoryEnabled && assistant.memory.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Remembering</span>
            {assistant.memory.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                {item.fact}
                <button
                  type="button"
                  aria-label={`Forget "${item.fact}"`}
                  onClick={() => assistant.forget(item.id)}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <form onSubmit={submit} className="border-t border-border px-3 py-3">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={`Ask ${config.displayName}…`}
            aria-label={`Ask ${config.displayName}`}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || assistant.sending}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        </div>
        {config.disclosureText && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{config.disclosureText}</p>}
      </form>
    </section>
  );
}
