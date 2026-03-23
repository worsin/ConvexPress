/**
 * Delivery Log Table Component
 *
 * Shows delivery history for a specific webhook.
 * Each row shows: Status (success/fail icon), Response Code, Event, Duration,
 * Attempt, Delivered At.
 * Rows are expandable to reveal full request/response via DeliveryDetail.
 *
 * Wired to real Convex queries via useQuery(api.api.queries.listDeliveries).
 */

import { Fragment, useState } from "react";
import { useQuery } from "convex/react";
import {
  CheckCircle2Icon,
  XCircleIcon,
  ChevronRightIcon,
  InboxIcon,
  FlaskConicalIcon,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn, asId } from "@/lib/utils";
import type { WebhookDelivery } from "@/lib/api/types";
import { DeliveryDetail } from "./delivery-detail";

interface DeliveryLogTableProps {
  webhookId: string;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function ResponseCodeBadge({ code }: { code?: number }) {
  if (code === undefined) {
    return (
      <span className="text-[10px] text-muted-foreground/50 font-mono">
        ---
      </span>
    );
  }

  const isSuccess = code >= 200 && code < 300;
  const isClientError = code >= 400 && code < 500;
  const isServerError = code >= 500;

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium",
        isSuccess && "bg-success/10 text-success",
        isClientError && "bg-warning/10 text-warning",
        isServerError && "bg-destructive/10 text-destructive",
        !isSuccess && !isClientError && !isServerError && "bg-muted text-muted-foreground",
      )}
    >
      {code}
    </span>
  );
}

export function DeliveryLogTable({ webhookId }: DeliveryLogTableProps) {
  const deliveries = useQuery(api.api.queries.listDeliveries, {
    webhookId: asId<"webhooks">(webhookId),
  }) as WebhookDelivery[] | undefined;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isLoading = deliveries === undefined;

  if (isLoading) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        Loading delivery history...
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center justify-center gap-2">
        <InboxIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">
          No deliveries yet. Send a test to see delivery logs here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground">
          Recent Deliveries
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {deliveries.length} deliveries
        </span>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="w-8 px-2 py-1.5" />
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Response
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Type
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Duration
              </th>
              <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Attempt
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Delivered At
              </th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => {
              const isExpanded = expandedId === delivery._id;

              return (
                <Fragment key={delivery._id}>
                  <tr
                    className={cn(
                      "border-b border-border transition-colors cursor-pointer",
                      "hover:bg-muted/20",
                      isExpanded && "bg-muted/10",
                    )}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : delivery._id)
                    }
                  >
                    {/* Expand arrow */}
                    <td className="px-2 py-2">
                      <ChevronRightIcon
                        className={cn(
                          "size-3 text-muted-foreground transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
                    </td>

                    {/* Success/Fail */}
                    <td className="px-2 py-2">
                      {delivery.success ? (
                        <CheckCircle2Icon className="size-3.5 text-success" />
                      ) : (
                        <XCircleIcon className="size-3.5 text-destructive" />
                      )}
                    </td>

                    {/* Response Code */}
                    <td className="px-2 py-2">
                      <ResponseCodeBadge code={delivery.responseCode} />
                    </td>

                    {/* Type (test or live) */}
                    <td className="px-2 py-2">
                      {delivery.isTest ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                          <FlaskConicalIcon className="size-3" />
                          Test
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Live
                        </span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-2 py-2 text-right text-[10px] text-muted-foreground tabular-nums">
                      {delivery.duration !== undefined
                        ? `${delivery.duration}ms`
                        : "---"}
                    </td>

                    {/* Attempt */}
                    <td className="px-2 py-2 text-center text-[10px] text-muted-foreground tabular-nums">
                      {delivery.attempt}
                    </td>

                    {/* Delivered At */}
                    <td className="px-2 py-2 text-[10px] text-muted-foreground">
                      {formatTimestamp(delivery.deliveredAt)}
                    </td>
                  </tr>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <tr key={`${delivery._id}-detail`}>
                      <td colSpan={7} className="p-0">
                        <DeliveryDetail delivery={delivery} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
