/**
 * EmailQueueDetailPage - Full-page detail view for a single email queue item.
 *
 * Shows complete email details including body preview, delivery timeline,
 * template variables, error log, and linked event information.
 *
 * Route: /admin/settings/email/queue/$queueId
 * Wired to:
 *   - api.emails.queries.getEmail
 *   - api.emails.mutations.retryEmail
 *   - api.emails.mutations.cancelEmail
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  ArrowLeft,
  RotateCcw,
  XCircle,
  Clock,
  Send,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Calendar,
  Activity,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getErrorMessage } from "@/lib/utils";

import { EMAIL_STATUS_CONFIG, EMAIL_PRIORITY_CONFIG } from "@/lib/email/constants";
import type { EmailStatus, EmailPriority } from "@/lib/email/types";
import type { Id } from "@backend/convex/_generated/dataModel";

export function EmailQueueDetailPage() {
  const { queueId } = useParams({
    from: "/_authenticated/_admin/settings/email_/queue/$queueId",
  });

  const email = useQuery(api.emails.queries.getEmail, {
    queueId: queueId as Id<"emailQueue">,
  });
  const retryEmail = useMutation(api.emails.mutations.retryEmail);
  const cancelEmail = useMutation(api.emails.mutations.cancelEmail);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [activeBodyTab, setActiveBodyTab] = useState<"html" | "source">("html");

  const handleRetry = useCallback(async () => {
    try {
      await retryEmail({ queueId: queueId as Id<"emailQueue"> });
      toast.success("Email queued for retry.");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to retry email.",
      );
    }
  }, [retryEmail, queueId]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelEmail({ queueId: queueId as Id<"emailQueue"> });
      toast.success("Email cancelled.");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel email.",
      );
    }
  }, [cancelEmail, queueId]);

  // Render HTML body in iframe
  useEffect(() => {
    if (activeBodyTab !== "html") return;
    const iframe = iframeRef.current;
    if (!iframe || !email?.bodyHtml) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(email.bodyHtml);
    doc.close();

    const resizeObserver = new ResizeObserver(() => {
      if (doc.body) {
        iframe.style.height = `${Math.max(doc.body.scrollHeight + 20, 300)}px`;
      }
    });

    if (doc.body) {
      resizeObserver.observe(doc.body);
    }

    return () => resizeObserver.disconnect();
  }, [email?.bodyHtml, activeBodyTab]);

  // Loading state
  if (email === undefined) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="h-80 w-full" />
          </div>
          <div>
            <Skeleton className="h-60 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (email === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-lg font-semibold mb-2">Email Not Found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          No email queue item with this ID was found.
        </p>
        <Link
          to="/settings/email"
          className="inline-flex items-center px-4 py-2 text-sm font-medium border border-input bg-card hover:bg-accent transition-colors"
        >
          Back to Email Settings
        </Link>
      </div>
    );
  }

  const statusConfig = EMAIL_STATUS_CONFIG[email.status as EmailStatus];
  const priorityConfig = EMAIL_PRIORITY_CONFIG[email.priority as EmailPriority];

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/settings/email"
            className="inline-flex size-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {email.subject}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              To: {email.toName ? `${email.toName} <${email.to}>` : email.to}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {email.status === "failed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="h-8 text-xs"
            >
              <RotateCcw className="mr-1.5 size-3" />
              Retry
            </Button>
          )}
          {email.status === "queued" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="h-8 text-xs text-destructive hover:text-destructive"
            >
              <XCircle className="mr-1.5 size-3" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Email body */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveBodyTab("html")}
                  className={cn(
                    "pb-2 text-xs font-medium transition-colors border-b-2",
                    activeBodyTab === "html"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  Rendered
                </button>
                <button
                  onClick={() => setActiveBodyTab("source")}
                  className={cn(
                    "pb-2 text-xs font-medium transition-colors border-b-2",
                    activeBodyTab === "source"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  Source
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {activeBodyTab === "html" ? (
                <div className="border border-border">
                  <iframe
                    ref={iframeRef}
                    title="Email body"
                    className="w-full min-h-[300px] bg-white"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <pre className="max-h-[500px] overflow-auto border border-border p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {email.bodyHtml}
                </pre>
              )}
            </CardContent>
          </Card>

          {/* Template Variables */}
          {email.templateVariables &&
            Object.keys(email.templateVariables).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Template Variables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {Object.entries(email.templateVariables).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex items-start gap-2 text-xs"
                        >
                          <span className="font-mono text-primary shrink-0">
                            {`{${key}}`}
                          </span>
                          <span className="text-muted-foreground truncate">
                            {value as string}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Error log */}
          {email.lastError && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-destructive" />
                  <CardTitle className="text-sm text-destructive">
                    Last Error
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono text-destructive/80 whitespace-pre-wrap">
                  {email.lastError}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar (1 col) */}
        <div className="flex flex-col gap-4">
          {/* Delivery Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Delivery Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-xs">
                <InfoRow label="Status">
                  {statusConfig && (
                    <span
                      className={cn(
                        "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
                        statusConfig.className,
                      )}
                    >
                      {statusConfig.label}
                    </span>
                  )}
                </InfoRow>

                <InfoRow label="Priority">
                  {priorityConfig && (
                    <span
                      className={cn(
                        "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
                        priorityConfig.className,
                      )}
                    >
                      {priorityConfig.label}
                    </span>
                  )}
                </InfoRow>

                <InfoRow label="Template">
                  <Link
                    to="/settings/email/templates/$templateSlug"
                    params={{ templateSlug: email.templateSlug }}
                    className="text-primary hover:underline font-mono text-[10px]"
                  >
                    {email.templateSlug}
                  </Link>
                </InfoRow>

                <InfoRow label="Attempts">
                  <span className="text-foreground">
                    {email.attempts} / {email.maxAttempts}
                  </span>
                </InfoRow>

                {email.resendId && (
                  <InfoRow label="Resend ID">
                    <span className="font-mono text-foreground text-[10px]">
                      {email.resendId}
                    </span>
                  </InfoRow>
                )}

                {email.correlationId && (
                  <InfoRow label="Correlation ID">
                    <span className="font-mono text-foreground text-[10px] truncate max-w-[150px]" title={email.correlationId}>
                      {email.correlationId}
                    </span>
                  </InfoRow>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sender Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sender</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 text-xs">
                <InfoRow label="From">
                  <span className="text-foreground">
                    {email.fromName} &lt;{email.from}&gt;
                  </span>
                </InfoRow>
                {email.replyTo && (
                  <InfoRow label="Reply-To">
                    <span className="text-foreground">{email.replyTo}</span>
                  </InfoRow>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground" />
                <CardTitle className="text-sm">Timeline</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2.5">
                <TimelineEntry
                  icon={Clock}
                  label="Created"
                  timestamp={email.createdAt}
                />
                {email.scheduledFor && (
                  <TimelineEntry
                    icon={Calendar}
                    label="Scheduled"
                    timestamp={email.scheduledFor}
                  />
                )}
                {email.lastAttemptAt && (
                  <TimelineEntry
                    icon={Activity}
                    label="Last Attempt"
                    timestamp={email.lastAttemptAt}
                  />
                )}
                {email.sentAt && (
                  <TimelineEntry
                    icon={Send}
                    label="Sent"
                    timestamp={email.sentAt}
                  />
                )}
                {email.deliveredAt && (
                  <TimelineEntry
                    icon={CheckCircle2}
                    label="Delivered"
                    timestamp={email.deliveredAt}
                    className="text-success"
                  />
                )}
                {email.openedAt && (
                  <TimelineEntry
                    icon={Mail}
                    label="Opened"
                    timestamp={email.openedAt}
                    className="text-primary"
                  />
                )}
                {email.nextRetryAt && (
                  <TimelineEntry
                    icon={RotateCcw}
                    label="Next Retry"
                    timestamp={email.nextRetryAt}
                    className="text-warning"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Linked Event */}
          {email.event && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <Activity className="size-3.5 text-muted-foreground" />
                  <CardTitle className="text-sm">Triggering Event</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2 text-xs">
                  <InfoRow label="Event Code">
                    <span className="font-mono text-foreground text-[10px]">
                      {email.event.code}
                    </span>
                  </InfoRow>
                  <InfoRow label="System">
                    <span className="text-foreground capitalize">
                      {email.event.system}
                    </span>
                  </InfoRow>
                  <InfoRow label="Emitted">
                    <span className="text-foreground">
                      {new Date(email.event.emittedAt).toLocaleString()}
                    </span>
                  </InfoRow>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TimelineEntry({
  icon: Icon,
  label,
  timestamp,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  timestamp: number;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto text-foreground text-[10px]">
        {new Date(timestamp).toLocaleString()}
      </span>
    </div>
  );
}
