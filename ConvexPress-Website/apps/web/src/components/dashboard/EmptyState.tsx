import type * as React from "react";

import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
}

/**
 * Consistent empty state component for widgets and lists with no data.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("py-8 text-center", className)}
    >
      <Icon className="mx-auto mb-3 size-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      {action && (
        <Link
          to={action.href}
          className="mt-3 inline-block text-xs text-primary hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
