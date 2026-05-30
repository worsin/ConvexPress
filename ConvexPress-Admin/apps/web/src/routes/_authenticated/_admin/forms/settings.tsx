import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldOff, Settings } from "lucide-react";

import type { Capability } from "@backend/convex/types/capabilities";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";

/**
 * Cast a `form.*` capability string to `Capability`. Mirrors the backend
 * helper in convex/extensions/forms/mutations.ts — the form capabilities are
 * surfaced here but registered by the Role/Capability expert, so they aren't in
 * the closed `Capability` union yet. These casts become no-ops once registered.
 */
const formCap = (cap: string): Capability => cap as Capability;

export const Route = createFileRoute("/_authenticated/_admin/forms/settings")({
  component: FormsSettingsPage,
});

function FormsSettingsPage() {
  return (
    <PluginGuard pluginId="forms">
      <FormsSettingsContent />
    </PluginGuard>
  );
}

function FormsSettingsContent() {
  const canManage = useCan(formCap("form.manage_security"));

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <ShieldOff className="mx-auto mb-3 size-8 text-muted-foreground/40" />
          <h1 className="text-lg font-semibold text-foreground">
            Insufficient permissions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You don&apos;t have permission to manage Forms settings.
          </p>
          <Link to="/forms" className="mt-4 inline-block">
            <Button variant="outline">Back to Forms</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Forms Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Global configuration for the Forms extension.
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="text-lg font-medium text-foreground">
          Security &amp; Spam
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Spam protection, captcha providers, and submission rate limits will be
          configured here. These controls are coming soon.
        </p>
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No global Forms settings are available yet.
          </p>
        </div>
      </section>
    </div>
  );
}
