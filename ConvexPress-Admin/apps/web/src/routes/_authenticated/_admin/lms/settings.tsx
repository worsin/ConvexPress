/**
 * LMS Settings — /lms/settings
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Settings, Sparkles, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/_admin/lms/settings")({
  component: LMSSettingsPage,
});

function LMSSettingsPage() {
  const { can } = useAuth();
  const canManageSettings = can("lms.settings.manage");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">LMS Settings</h1>
      </div>

      {!canManageSettings ? (
        <div className="rounded-lg border border-border bg-muted/30 p-5">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Settings unavailable
          </div>
          <p className="text-sm text-muted-foreground">
            LMS settings are not available for your role.
          </p>
        </div>
      ) : null}

      {canManageSettings ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-5">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-success" /> Extension enabled
            </div>
            <p className="text-sm text-muted-foreground">
              The LMS extension is active. New courses default to{" "}
              <strong>members (plan-gated)</strong> access and{" "}
              <strong>linear</strong> progression. Course access is enforced
              through the Membership extension's restriction rules.
            </p>
          </div>

          <div className="rounded-lg border border-border p-5">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" /> AI generation
            </div>
            <p className="text-sm text-muted-foreground">
              AI course generation reuses Claude + Tavily. Configure provider keys
              under{" "}
              <Link to="/settings/ai" className="text-primary hover:underline">
                Settings → AI Providers
              </Link>
              .
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
