/**
 * The notification center's actions, bound to the Convex mutations and
 * wrapped with toasts. Shared by the center page, the bell, and the widget.
 */

import { useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { explainError } from "@/lib/support-tickets";

export interface NotificationActions {
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  markActioned: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  snooze: (id: string, until: number) => Promise<void>;
  unsnooze: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  archiveRead: () => Promise<void>;
}

function whenLabel(until: number): string {
  return new Date(until).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export function useNotificationActions(options: { onSnoozed?: (id: string) => void; quiet?: boolean } = {}): NotificationActions {
  const markRead = useMutation(api.notifications.mutations.markRead);
  const markUnread = useMutation(api.notifications.mutations.markUnread);
  const markActioned = useMutation(api.notifications.mutations.markActioned);
  const archive = useMutation(api.notifications.mutations.archive);
  const restore = useMutation(api.notifications.mutations.restore);
  const snooze = useMutation(api.notifications.mutations.snooze);
  const unsnooze = useMutation(api.notifications.mutations.unsnooze);
  const markAllRead = useMutation(api.notifications.mutations.markAllRead);
  const archiveRead = useMutation(api.notifications.mutations.archiveRead);
  const { onSnoozed, quiet = false } = options;

  return useMemo<NotificationActions>(() => {
    const run = async (work: () => Promise<unknown>, okMessage?: string) => {
      try {
        await work();
        if (okMessage && !quiet) toast.success(okMessage);
      } catch (err) {
        toast.error("That didn't go through", { description: explainError(err, "Please try again.") });
      }
    };
    return {
      markRead: (id) => run(() => markRead({ notificationId: id })),
      markUnread: (id) => run(() => markUnread({ notificationId: id })),
      markActioned: (id) => run(() => markActioned({ notificationId: id })),
      archive: (id) => run(() => archive({ notificationId: id }), "Archived"),
      restore: (id) => run(() => restore({ notificationId: id }), "Back in your inbox"),
      snooze: async (id, until) => {
        try {
          await snooze({ notificationId: id, until });
          if (!quiet) toast.success("Snoozed", { description: `It'll be back ${whenLabel(until)}.` });
          onSnoozed?.(id);
        } catch (err) {
          toast.error("Couldn't snooze", { description: explainError(err, "Please try again.") });
        }
      },
      unsnooze: (id) => run(() => unsnooze({ notificationId: id }), "Back in your inbox"),
      markAllRead: () => run(() => markAllRead({}), "All read"),
      archiveRead: async () => {
        try {
          const result = (await archiveRead({})) as { count?: number } | undefined;
          const count = result?.count ?? 0;
          if (!quiet) toast.success(count > 0 ? `Archived ${count} you'd already read` : "Nothing to archive");
        } catch (err) {
          toast.error("That didn't go through", { description: explainError(err, "Please try again.") });
        }
      },
    };
  }, [markRead, markUnread, markActioned, archive, restore, snooze, unsnooze, markAllRead, archiveRead, onSnoozed, quiet]);
}
