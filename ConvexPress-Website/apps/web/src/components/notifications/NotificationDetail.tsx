import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlarmClock, Archive, ArchiveRestore, ArrowUpRight, ExternalLink, Headphones, LifeBuoy, Mail, MailOpen, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { KIND_META, SNOOZE_PRESETS, fullTime, isArchived, isPendingAction, isSnoozed, linkLabel, resolveLink, type CenterNotification, type LinkTarget } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KIND_ICON, NEEDS_CHIP, NEUTRAL_CHIP, TYPE_CHIP, tileClass } from "@/components/notifications/kind";
import type { NotificationActions } from "@/components/notifications/useNotificationActions";

/** Href for a resolved link target, with dashboard paths rebuilt under the configured base path. */
export function useTargetHref(target: LinkTarget): string | null {
  const { to } = useDashboardPath();
  switch (target?.kind) {
    case "ticket":
      return to(`/tickets/${target.ticketNumber}`);
    case "ticketById":
      // The public route resolves an id to its ticket number and redirects into the dashboard.
      return `/support/tickets/${target.ticketId}`;
    case "dashboard":
      return to(target.subpath);
    case "path":
      return target.path;
    default:
      return null;
  }
}

/** Link to wherever a notification points. Renders nothing when there is no safe target. */
export function TargetLink({ n, className, children, onClick }: { n: CenterNotification; className?: string; children: ReactNode; onClick?: () => void }) {
  const target = resolveLink(n);
  const href = useTargetHref(target);
  if (!href) return null;
  const external = /^https?:\/\//i.test(href);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href as "/"} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

export interface NotificationDetailProps {
  n: CenterNotification;
  actions: NotificationActions;
  now: number;
  onClose: () => void;
}

/**
 * The open notification: full message, the action link, "ask about this",
 * snooze / read / archive controls, and a small receipt timeline.
 */
export function NotificationDetail({ n, actions, now, onClose }: NotificationDetailProps) {
  const { to } = useDashboardPath();
  const Icon = KIND_ICON[n.kind] ?? KIND_ICON.system;
  const target = resolveLink(n);
  const read = typeof n.readAt === "number";
  const archived = isArchived(n);
  const snoozed = isSnoozed(n, now);
  const pending = isPendingAction(n, now);
  const typeChip = TYPE_CHIP[n.type];
  const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-4xl px-3.5 text-sm font-semibold transition-colors outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50";
  const askHref = to(`/tickets/new?subject=${encodeURIComponent(`Question about: ${n.title}`.slice(0, 200))}&context=${encodeURIComponent(`Notification received ${fullTime(n.createdAt)}:\n"${n.title}"\n${n.message}`.slice(0, 2000))}`);

  return (
    <article className="rounded-2xl border border-border bg-card shadow-sm" aria-labelledby={`notif-${n.id}`}>
      <header className="flex items-start gap-3 border-b border-border p-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tileClass(n.kind, n.type))}>
          {n.actorAvatarUrl ? <img src={n.actorAvatarUrl} alt="" className="size-10 rounded-xl object-cover" /> : <Icon className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`notif-${n.id}`} className="text-[16px] font-bold leading-tight text-foreground">
            {n.title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {KIND_META[n.kind]?.label ?? "Site"}
            {n.actorName ? ` · ${n.actorName}` : ""} · <time dateTime={new Date(n.createdAt).toISOString()}>{fullTime(n.createdAt)}</time>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pending && <span className={NEEDS_CHIP}>Needs you</span>}
            {!pending && typeChip && <span className={typeChip.className}>{typeChip.label}</span>}
            {snoozed && (
              <span className={cn(NEUTRAL_CHIP, "gap-1")}>
                <AlarmClock className="size-3" aria-hidden />
                Snoozed until {fullTime(n.snoozedUntil!)}
              </span>
            )}
            {archived && <span className={NEUTRAL_CHIP}>Archived</span>}
            {typeof n.actionedAt === "number" && <span className={NEUTRAL_CHIP}>Done</span>}
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <X className="size-4" />
        </button>
      </header>

      <div className="space-y-4 p-4">
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground">{n.message}</p>

        {n.ticketNumber && (
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="text-[11px] font-semibold text-muted-foreground">About</div>
            <Link to={to(`/tickets/${n.ticketNumber}`) as "/"} className="mt-1 flex items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-card">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
                <Headphones className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tabular-nums text-foreground">Ticket {n.ticketNumber}</span>
                <span className="block text-xs text-muted-foreground">Open the conversation</span>
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground/70" aria-hidden />
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {target && (
            <TargetLink n={n} className={cn(btn, "bg-primary text-primary-foreground hover:bg-primary/85")} onClick={() => void actions.markActioned(n.id)}>
              {linkLabel(target, n.actionLabel)}
              <ExternalLink className="size-4" aria-hidden />
            </TargetLink>
          )}
          {n.ticketNumber ? (
            <Link to={to(`/tickets/${n.ticketNumber}`) as "/"} className={cn(btn, "border border-border bg-card text-foreground hover:bg-muted")}>
              <Headphones className="size-4" aria-hidden />
              Reply in ticket
            </Link>
          ) : (
            <Link to={askHref as "/"} className={cn(btn, "border border-border bg-card text-foreground hover:bg-muted")}>
              <LifeBuoy className="size-4" aria-hidden />
              Ask about this
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              <AlarmClock className="size-4" aria-hidden />
              {snoozed ? "Change snooze" : "Snooze"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 rounded-xl">
              {SNOOZE_PRESETS.map((p) => (
                <DropdownMenuItem key={p.key} onClick={() => void actions.snooze(n.id, p.until(Date.now()))}>
                  {p.label}
                </DropdownMenuItem>
              ))}
              {snoozed && <DropdownMenuItem onClick={() => void actions.unsnooze(n.id)}>Bring back now</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => void (read ? actions.markUnread(n.id) : actions.markRead(n.id))}>
            {read ? <Mail className="size-4" aria-hidden /> : <MailOpen className="size-4" aria-hidden />}
            {read ? "Mark unread" : "Mark read"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void (archived ? actions.restore(n.id) : actions.archive(n.id));
              if (!archived) onClose();
            }}
          >
            {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
            {archived ? "Restore" : "Archive"}
          </Button>
        </div>

        <ol className="space-y-1 text-xs text-muted-foreground">
          <li className="flex justify-between gap-3">
            <span>Received</span>
            <span className="tabular-nums">{fullTime(n.createdAt)}</span>
          </li>
          {typeof n.readAt === "number" && (
            <li className="flex justify-between gap-3">
              <span>Read</span>
              <span className="tabular-nums">{fullTime(n.readAt)}</span>
            </li>
          )}
          {typeof n.actionedAt === "number" && (
            <li className="flex justify-between gap-3">
              <span>Opened the link</span>
              <span className="tabular-nums">{fullTime(n.actionedAt)}</span>
            </li>
          )}
          {typeof n.dismissedAt === "number" && (
            <li className="flex justify-between gap-3">
              <span>Archived</span>
              <span className="tabular-nums">{fullTime(n.dismissedAt)}</span>
            </li>
          )}
        </ol>
      </div>
    </article>
  );
}
