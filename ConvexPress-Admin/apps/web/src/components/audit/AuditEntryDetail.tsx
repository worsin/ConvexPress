/**
 * AuditEntryDetail Component
 *
 * Full detail view for a single audit entry.
 * Sections: Header, Actor, Object, Changes, Payload, Event, Related.
 */

import { useCallback } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  UserIcon,
  FileTextIcon,
  ClockIcon,
  LinkIcon,
  ServerIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuditEntryDetail as AuditEntryDetailType } from "@/lib/audit/types";
import {
  formatAuditDate,
  formatRelativeTime,
  formatObjectTypeLabel,
  formatSystemLabel,
} from "@/lib/audit/formatters";
import { SeverityBadge } from "./SeverityBadge";
import { AuditChangesTable } from "./AuditChangesTable";
import { AuditPayloadViewer } from "./AuditPayloadViewer";

interface AuditEntryDetailProps {
  entry: AuditEntryDetailType;
}

export function AuditEntryDetail({ entry }: AuditEntryDetailProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/tools/audit-log" })}
        >
          <ArrowLeftIcon className="size-3.5 mr-1" />
          Back to Audit Log
        </Button>
      </div>

      {/* Header */}
      <div className="border border-border rounded-none bg-card p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <SeverityBadge severity={entry.severity} variant="full" />
              <code className="text-[11px] text-muted-foreground">
                {entry.eventCode}
              </code>
            </div>
            <h1 className="text-sm font-medium text-foreground">
              {entry.description}
            </h1>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3" />
                {formatAuditDate(entry.occurredAt)}
              </span>
              <span>{formatRelativeTime(entry.occurredAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout for Actor + Object */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Actor section */}
        <div className="border border-border rounded-none bg-card p-4">
          <h2 className="text-xs font-medium text-foreground mb-3 flex items-center gap-1.5">
            <UserIcon className="size-3.5" />
            Actor
          </h2>
          <div className="space-y-2 text-xs">
            <DetailRow
              label="Name"
              value={entry.actor.name ?? "System"}
            />
            {entry.actor.email && (
              <DetailRow label="Email" value={entry.actor.email} />
            )}
            {entry.actor.role && (
              <DetailRow
                label="Role"
                value={entry.actor.role}
                className="capitalize"
              />
            )}
            {entry.actor.ip && (
              <DetailRow label="IP Address" value={entry.actor.ip} mono />
            )}
            {entry.actor.userAgent && (
              <DetailRow
                label="User Agent"
                value={entry.actor.userAgent}
                mono
                truncate
              />
            )}
            {!entry.actor.id && (
              <div className="text-muted-foreground italic">
                System-generated event (no user actor)
              </div>
            )}
          </div>
        </div>

        {/* Object section */}
        <div className="border border-border rounded-none bg-card p-4">
          <h2 className="text-xs font-medium text-foreground mb-3 flex items-center gap-1.5">
            <FileTextIcon className="size-3.5" />
            Object
          </h2>
          <div className="space-y-2 text-xs">
            <DetailRow
              label="Type"
              value={formatObjectTypeLabel(entry.objectType)}
            />
            {entry.objectId && (
              <DetailRow label="ID" value={entry.objectId} mono />
            )}
            {entry.objectLabel && (
              <DetailRow label="Label" value={entry.objectLabel} />
            )}
            {entry.system && (
              <DetailRow
                label="System"
                value={formatSystemLabel(entry.system)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Changes section */}
      {entry.changes && entry.changes.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-foreground mb-2">
            Changes
          </h2>
          <AuditChangesTable changes={entry.changes} />
        </div>
      )}

      {/* Payload section */}
      <div>
        <AuditPayloadViewer
          payload={entry.rawPayload}
          defaultCollapsed={true}
          label="Raw Event Payload"
        />
      </div>

      {/* Event processing section */}
      {entry.event && (
        <div className="border border-border rounded-none bg-card p-4">
          <h2 className="text-xs font-medium text-foreground mb-3 flex items-center gap-1.5">
            <ServerIcon className="size-3.5" />
            Event Processing
          </h2>
          <div className="space-y-2 text-xs">
            <DetailRow
              label="Status"
              value={
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    entry.event.status === "completed"
                      ? "text-primary"
                      : entry.event.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {entry.event.status === "completed" ? (
                    <CheckCircleIcon className="size-3" />
                  ) : entry.event.status === "failed" ? (
                    <XCircleIcon className="size-3" />
                  ) : (
                    <AlertCircleIcon className="size-3" />
                  )}
                  {entry.event.status}
                </span>
              }
            />
            <DetailRow
              label="Listeners"
              value={`${entry.event.listenersCompleted}/${entry.event.listenersTotal} completed`}
            />
            {entry.event.listenersFailed > 0 && (
              <DetailRow
                label="Failed"
                value={
                  <span className="text-destructive">
                    {entry.event.listenersFailed} failed
                  </span>
                }
              />
            )}
            {entry.event.processedAt && (
              <DetailRow
                label="Processed"
                value={formatAuditDate(entry.event.processedAt)}
              />
            )}
          </div>
        </div>
      )}

      {/* Related entries section */}
      {entry.relatedEntries && entry.relatedEntries.length > 0 && (
        <div className="border border-border rounded-none bg-card p-4">
          <h2 className="text-xs font-medium text-foreground mb-3 flex items-center gap-1.5">
            <LinkIcon className="size-3.5" />
            Related Entries ({entry.relatedEntries.length})
          </h2>
          <div className="space-y-1">
            {entry.relatedEntries.map((related) => (
              <Link
                key={related._id}
                to="/tools/audit-log/$entryId"
                params={{ entryId: related._id }}
                className="flex items-center justify-between py-1.5 px-2 text-xs hover:bg-muted/30 rounded-none transition-colors"
              >
                <div className="flex items-center gap-2">
                  <code className="text-[11px] text-muted-foreground">
                    {related.eventCode}
                  </code>
                  <span className="text-foreground truncate max-w-[250px]">
                    {related.description}
                  </span>
                </div>
                <span className="text-muted-foreground text-[11px] shrink-0">
                  {formatRelativeTime(related.occurredAt)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DetailRow helper ───────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
  truncate = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  truncate?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span
        className={cn(
          "text-foreground",
          mono && "font-mono text-[11px]",
          truncate && "truncate max-w-[200px]",
          className,
        )}
      >
        {value}
      </span>
    </div>
  );
}
