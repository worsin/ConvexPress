/**
 * EmailSettingsPage - Main email settings page.
 *
 * Combines stats overview, email configuration settings,
 * template list, and delivery queue monitor into one page.
 *
 * Route: /admin/settings/email
 * Capability: manage_options (enforced by parent settings layout)
 */

import { EmailStatsCards } from "./EmailStatsCards";
import { EmailSettingsForm } from "./EmailSettingsForm";
import { SendTestEmail } from "./SendTestEmail";
import { EmailTemplateList } from "./EmailTemplateList";
import { EmailQueueMonitor } from "./EmailQueueMonitor";

export function EmailSettingsPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Email Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage email templates, monitor delivery, and configure notification
          settings.
        </p>
      </div>

      {/* Stats overview */}
      <EmailStatsCards />

      {/* Email configuration */}
      <EmailSettingsForm />

      {/* Send test email */}
      <SendTestEmail />

      {/* Template list */}
      <EmailTemplateList />

      {/* Queue monitor */}
      <EmailQueueMonitor />
    </div>
  );
}
