import type { ReactNode } from "react";
import { AlarmClock, Archive, ArchiveRestore, Mail, MailOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { KIND_META, fullTime, isArchived, isPendingAction, isSnoozed, relativeTime, type CenterNotification } from "@/lib/notifications";
import { KIND_ICON, NEEDS_CHIP, TYPE_CHIP, tileClass } from "@/components/notifications/kind";
import type { NotificationActions } from "@/components/notifications/useNotificationActions";

export interface NotificationRowProps {
  n: CenterNotification;
  now: number;
  onOpen: () => void;
  index?: number;
  active?: boolean;
  selected?: boolean;
  onHover?: () => void;
  actions?: NotificationActions;
  /** Tight layout for the bell popover and the widget. */
  compact?: boolean;
}

/**
 * One notification in a list. Unread rows are bold with a dot on the tile;
 * rows that need the member carry an accent bar. Hover actions (read /
 * archive) appear on the right on pointer devices.
 */
export function NotificationRow({ n, now, onOpen, index, active, selected, onHover, actions, compact = false }: NotificationRowProps) {
  const Icon = KIND_ICON[n.kind] ?? KIND_ICON.system;
  const unread = typeof n.readAt !== "number";
  const pending = isPendingAction(n, now);
  const snoozed = isSnoozed(n, now);
  const archived = isArchived(n);
  const typeChip = TYPE_CHIP[n.type];

  return (
    <li data-index={index} onMouseEnter={onHover} className="list-none">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-current={selected ? "true" : undefined}
        aria-label={`${unread ? "Unread. " : ""}${n.title}`}
        className={cn(
          "group relative flex w-full cursor-pointer items-start gap-3 rounded-2xl border bg-card text-left outline-hidden transition-[box-shadow,border-color,background-color] focus-visible:ring-[3px] focus-visible:ring-ring/50",
          compact ? "p-2.5" : "p-3.5 pr-3",
          selected ? "border-primary/60 bg-primary/5 shadow-sm" : active ? "border-foreground/30 shadow-sm" : "border-border hover:border-foreground/25 hover:shadow-md",
          pending && "before:absolute before:-left-px before:bottom-3 before:top-3 before:w-[3px] before:rounded-r-[3px] before:bg-warning",
        )}
      >
        <span className={cn("relative mt-0.5 grid shrink-0 place-items-center rounded-xl", compact ? "size-8" : "size-9", tileClass(n.kind, n.type))}>
          {n.actorAvatarUrl ? (
            <img src={n.actorAvatarUrl} alt="" className={cn("rounded-xl object-cover", compact ? "size-8" : "size-9")} />
          ) : (
            <Icon className={compact ? "size-4" : "size-[18px]"} aria-hidden />
          )}
          {unread && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary ring-2 ring-card" aria-hidden />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("line-clamp-2 leading-tight text-foreground", compact ? "text-[13.5px]" : "text-[14.5px]", unread ? "font-bold" : "font-medium")}>{n.title}</p>
            <time dateTime={new Date(n.createdAt).toISOString()} title={fullTime(n.createdAt)} className="shrink-0 text-xs tabular-nums text-muted-foreground/80">
              {relativeTime(n.createdAt, now)}
            </time>
          </div>
          <p className={cn("mt-0.5 line-clamp-1 text-[13px]", unread ? "text-foreground/90" : "text-muted-foreground")}>{n.message}</p>
          {!compact && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground/80">
              {pending && <span className={NEEDS_CHIP}>Needs you</span>}
              {!pending && typeChip && <span className={typeChip.className}>{typeChip.label}</span>}
              {snoozed && (
                <span className="inline-flex items-center gap-1">
                  <AlarmClock className="size-3" aria-hidden />
                  Back {relativeTime(n.snoozedUntil!, now)}
                </span>
              )}
              <span>{KIND_META[n.kind]?.label ?? "Site"}</span>
              {n.actorName && <span className="truncate">by {n.actorName}</span>}
              {n.ticketNumber && <span className="tabular-nums">{n.ticketNumber}</span>}
              {typeof n.groupCount === "number" && n.groupCount > 1 && <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium">+{n.groupCount - 1} more</span>}
            </div>
          )}
        </div>

        {!compact && actions && (
          <div
            className="absolute right-2 top-2 hidden gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm group-hover:flex group-focus-within:flex"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <IconButton label={unread ? "Mark read" : "Mark unread"} onClick={() => void (unread ? actions.markRead(n.id) : actions.markUnread(n.id))}>
              {unread ? <MailOpen className="size-3.5" /> : <Mail className="size-3.5" />}
            </IconButton>
            <IconButton label={archived ? "Restore" : "Archive"} onClick={() => void (archived ? actions.restore(n.id) : actions.archive(n.id))}>
              {archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            </IconButton>
          </div>
        )}
      </div>
    </li>
  );
}

export function IconButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("grid size-7 place-items-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50", className)}
    >
      {children}
    </button>
  );
}
