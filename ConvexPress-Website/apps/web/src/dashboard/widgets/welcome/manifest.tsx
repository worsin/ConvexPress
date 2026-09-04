/**
 * Welcome widget: greeting from dashboardConfig.welcomeHeadline ({name}),
 * avatar, and next steps derived from what is not set up yet (no avatar, no
 * address when commerce is on, unread notifications).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { AvatarDisplay } from "@/components/dashboard/profile/AvatarDisplay";
import { useSettings } from "@/contexts/SettingsContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { renderWelcomeHeadline } from "@/lib/dashboard/config";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetSkeleton } from "../../grid/WidgetCard";
import { resolveIcon } from "../../icons";
import { useDashboardShell } from "../../shell/DashboardShellContext";

interface NextStep {
  id: string;
  label: string;
  href: string;
  icon: string;
}

function WelcomeWidget({ size }: DashboardWidgetProps) {
  const { user } = useCurrentUser();
  const { config, badges, to } = useDashboardShell();
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const addresses = useQuery(api.commerce.customers.getMyAddresses, commerceEnabled ? {} : "skip") as
    | unknown[]
    | undefined;

  if (!user) return <WidgetSkeleton rows={3} />;

  const firstName = user.firstName ?? user.displayName.split(" ")[0] ?? "";
  const headline = renderWelcomeHeadline(config.welcomeHeadline, firstName);
  const unread = badges?.["notifications.unread"] ?? 0;
  const steps: NextStep[] = [];
  if (!user.avatarUrl && !user.oauthAvatarUrl) {
    steps.push({ id: "avatar", label: "Add a profile photo", href: to("/profile"), icon: "user" });
  }
  if (commerceEnabled && addresses !== undefined && addresses.length === 0) {
    steps.push({ id: "address", label: "Save a shipping address", href: to("/addresses"), icon: "map-pin" });
  }
  if (unread > 0) {
    steps.push({
      id: "notifications",
      label: `Read ${unread} unread notification${unread === 1 ? "" : "s"}`,
      href: to("/notifications"),
      icon: "bell",
    });
  }
  const maxSteps = size === "md" ? 2 : 3;

  return (
    <div className={cn("flex h-full gap-4", size === "xl" ? "items-center" : "flex-col")}>
      <div className="flex items-center gap-3">
        {size !== "md" && (
          <AvatarDisplay
            avatarUrl={user.avatarUrl}
            oauthAvatarUrl={user.oauthAvatarUrl}
            displayName={user.displayName}
            size="md"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight text-foreground">{headline}</p>
          <p className="text-xs text-muted-foreground">
            {steps.length === 0 ? "Everything is set up. Here is what is happening with your account." : "A few quick things to finish setting up."}
          </p>
        </div>
      </div>
      {steps.length === 0 ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-primary">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          You&apos;re all set
        </p>
      ) : (
        <ul role="list" className={cn("grid gap-1.5", size === "xl" ? "ml-auto grid-cols-3" : "grid-cols-1")}>
          {steps.slice(0, maxSteps).map((step) => {
            const Icon = resolveIcon(step.icon);
            return (
              <li key={step.id}>
                <Link
                  to={step.href}
                  className="group flex items-center gap-2 border border-border px-3 py-2 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">{step.label}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function cn(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const module: DashboardWidgetModule = {
  id: "welcome",
  Widget: WelcomeWidget,
  title: () => "Welcome",
};

export default module;
