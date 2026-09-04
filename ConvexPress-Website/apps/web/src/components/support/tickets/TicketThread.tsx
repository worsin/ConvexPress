import { useEffect, useRef } from "react";
import { FileText, Paperclip } from "lucide-react";

import { cn } from "@/lib/utils";
import { AgentAvatar, AssistantAvatar, PersonAvatar } from "@/components/support/tickets/TicketBits";
import { firstName, formatBytes, fullTime, groupByDay, initials, timeOfDay, type ThreadMessage, type TicketAttachment } from "@/lib/support-tickets";

interface TicketThreadProps {
  messages: ThreadMessage[];
  /** The signed-in customer's display name, for "You" bubbles. */
  viewerName: string;
  siteName?: string;
  now?: number;
  /** Scroll the newest message into view when the count changes. */
  autoScroll?: boolean;
}

/**
 * The conversation. Customer messages sit on the right on the brand tint,
 * our team's on the left with the headset avatar, assistant replies with an
 * AI mark, system notes centered. Grouped by day so a long thread stays
 * readable.
 */
export function TicketThread({ messages, viewerName, siteName, now = Date.now(), autoScroll = true }: TicketThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = messages.length;
  useEffect(() => {
    if (autoScroll && count > 0) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [count, autoScroll]);

  if (messages.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No messages yet.</div>;
  }

  return (
    <div className="space-y-6">
      {groupByDay(messages, now).map((group) => (
        <section key={group.label} aria-label={group.label} className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{group.label}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {group.items.map((m) => (
            <Message key={m._id} message={m} viewerName={viewerName} siteName={siteName} />
          ))}
        </section>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function Message({ message, viewerName, siteName }: { message: ThreadMessage; viewerName: string; siteName?: string }) {
  const mine = message.senderType === "user";
  const system = message.senderType === "system";
  const ai = message.senderType === "ai";
  const agent = message.senderType === "admin";

  if (system) {
    return (
      <div className="flex justify-center">
        <span className="max-w-[85%] rounded-full border border-border bg-muted/60 px-3 py-1 text-center text-xs text-muted-foreground">
          {message.content}
          <time dateTime={new Date(message.createdAt).toISOString()} title={fullTime(message.createdAt)} className="ml-2 text-muted-foreground/70">
            {timeOfDay(message.createdAt)}
          </time>
        </span>
      </div>
    );
  }

  const who = mine ? "You" : ai ? "Assistant" : `${firstName(message.senderName)}${siteName ? ` from ${siteName}` : " from support"}`;

  return (
    <div className={cn("flex items-end gap-2.5", mine ? "flex-row-reverse" : "flex-row")}>
      {agent ? <AgentAvatar name={message.senderName} /> : ai ? <AssistantAvatar /> : <PersonAvatar initials={initials(viewerName || message.senderName)} />}
      <div className={cn("flex max-w-[min(85%,640px)] flex-col gap-1", mine ? "items-end" : "items-start")}>
        <div className={cn("flex items-baseline gap-2 text-xs text-muted-foreground", mine && "flex-row-reverse")}>
          <span className="font-semibold text-foreground">{who}</span>
          <time dateTime={new Date(message.createdAt).toISOString()} title={fullTime(message.createdAt)}>
            {timeOfDay(message.createdAt)}
          </time>
          {message.editedAt && <span>(edited)</span>}
        </div>
        <div
          className={cn(
            "max-w-full whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed",
            mine ? "rounded-br-md bg-primary/12 text-foreground" : ai ? "rounded-bl-md border border-secondary bg-secondary/40 text-foreground" : "rounded-bl-md border border-border bg-card text-foreground shadow-sm",
          )}
        >
          {message.content}
        </div>
        {message.attachments && message.attachments.length > 0 && <Attachments items={message.attachments} align={mine ? "end" : "start"} />}
      </div>
    </div>
  );
}

function Attachments({ items, align }: { items: TicketAttachment[]; align: "start" | "end" }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", align === "end" ? "justify-end" : "justify-start")}>
      {items.map((a, i) => {
        const image = a.mimeType.startsWith("image/");
        return (
          <li key={`${a.name}-${i}`}>
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pr-3 text-xs transition-colors hover:border-foreground/30">
              {image ? (
                <img src={a.url} alt="" className="size-12 rounded-lg object-cover" />
              ) : (
                <span className="grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-5" aria-hidden />
                </span>
              )}
              <span className="min-w-0">
                <span className="block max-w-[180px] truncate font-medium text-foreground">{a.name}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Paperclip className="size-3" aria-hidden />
                  {formatBytes(a.size)}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
