/**
 * Visual vocabulary for notification kinds and types: icon per kind, tile
 * tint per kind, and the accent used for "needs you". Tokens only.
 */

import { Bell, BookOpen, CreditCard, FileText, Headphones, ShieldCheck, type LucideIcon } from "lucide-react";

import type { NotificationKind, NotificationType } from "@/lib/notifications";

export const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  support: Headphones,
  commerce: CreditCard,
  learning: BookOpen,
  content: FileText,
  account: ShieldCheck,
  system: Bell,
};

export const KIND_TILE: Record<NotificationKind, string> = {
  support: "bg-primary/12 text-primary",
  commerce: "bg-success/15 text-success",
  learning: "bg-secondary text-secondary-foreground",
  content: "bg-accent text-accent-foreground",
  account: "bg-warning/15 text-warning",
  system: "bg-muted text-muted-foreground",
};

/** Type overrides the kind tint when the notification is a warning or error. */
export function tileClass(kind: NotificationKind, type: NotificationType): string {
  if (type === "error") return "bg-destructive/10 text-destructive";
  if (type === "warning") return "bg-warning/15 text-warning";
  return KIND_TILE[kind] ?? KIND_TILE.system;
}

export const NEEDS_CHIP = "inline-flex h-5 items-center rounded-full bg-warning/15 px-2 text-[11px] font-semibold text-warning";
export const NEUTRAL_CHIP = "inline-flex h-5 items-center rounded-full border border-border px-2 text-[11px] font-medium text-muted-foreground";
export const TYPE_CHIP: Partial<Record<NotificationType, { label: string; className: string }>> = {
  error: { label: "Action required", className: "inline-flex h-5 items-center rounded-full bg-destructive/10 px-2 text-[11px] font-semibold text-destructive" },
  warning: { label: "Heads up", className: NEEDS_CHIP },
};
