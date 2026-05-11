/**
 * SettingsSection — card shell with heading + helper text + slot.
 * Shared across every integration detail page.
 */

import type { ReactNode } from "react";

export interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: SettingsSectionProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
