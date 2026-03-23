/**
 * SettingsCallout - Info/warning/error callout boxes.
 *
 * Used within settings sections to provide important context,
 * disclaimers, or warnings about destructive settings.
 */

import type * as React from "react";
import { Info, OctagonX, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingsCalloutProps {
  /** Callout type determines icon and colors */
  type: "info" | "warning" | "error";
  /** Message content */
  children: React.ReactNode;
  /** Optional link */
  link?: { text: string; href: string };
}

const calloutStyles = {
  info: {
    container: "bg-primary/5 border-primary/20",
    icon: "text-primary",
    role: "note" as const,
  },
  warning: {
    container: "bg-foreground/5 border-foreground/15",
    icon: "text-muted-foreground",
    role: "alert" as const,
  },
  error: {
    container: "bg-destructive/10 border-destructive/30",
    icon: "text-destructive",
    role: "alert" as const,
  },
};

const calloutIcons = {
  info: Info,
  warning: TriangleAlert,
  error: OctagonX,
};

export function SettingsCallout({
  type,
  children,
  link,
}: SettingsCalloutProps) {
  const styles = calloutStyles[type];
  const Icon = calloutIcons[type];

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-none border p-3 text-xs",
        styles.container,
      )}
      role={styles.role}
    >
      <Icon className={cn("size-4 shrink-0 mt-0.5", styles.icon)} />
      <div className="flex-1">
        <span className="text-foreground">{children}</span>
        {link && (
          <a
            href={link.href}
            className="ml-1 text-primary underline underline-offset-2 hover:no-underline"
          >
            {link.text}
          </a>
        )}
      </div>
    </div>
  );
}
