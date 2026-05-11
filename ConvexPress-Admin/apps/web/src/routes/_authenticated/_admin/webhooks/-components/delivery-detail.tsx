/**
 * Delivery Detail Component
 *
 * Expandable view showing full request/response data for a webhook delivery.
 * Displays request headers, body, response headers, body, and error message.
 */

import type { WebhookDelivery } from "@/lib/api/types";

interface DeliveryDetailProps {
  delivery: WebhookDelivery;
}

function JsonBlock({ label, data }: { label: string; data: string }) {
  let formatted: string;
  try {
    const parsed = JSON.parse(data);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    formatted = data;
  }

  return (
    <div className="space-y-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <pre className="bg-muted p-2 text-[10px] font-mono overflow-x-auto border border-border text-muted-foreground max-h-40 overflow-y-auto">
        {formatted}
      </pre>
    </div>
  );
}

export function DeliveryDetail({ delivery }: DeliveryDetailProps) {
  return (
    <div className="space-y-3 p-3 bg-muted/20 border border-border">
      {/* Error message */}
      {delivery.error && (
        <div className="border border-destructive/30 bg-destructive/5 p-2">
          <span className="text-[10px] font-semibold text-destructive uppercase tracking-wider">
            Error
          </span>
          <p className="text-xs text-destructive mt-0.5">{delivery.error}</p>
        </div>
      )}

      {/* Request */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <JsonBlock label="Request Headers" data={delivery.requestHeaders} />
        <JsonBlock label="Request Body" data={delivery.requestBody} />
      </div>

      {/* Response */}
      {(delivery.responseHeaders || delivery.responseBody) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {delivery.responseHeaders && (
            <JsonBlock
              label="Response Headers"
              data={delivery.responseHeaders}
            />
          )}
          {delivery.responseBody && (
            <JsonBlock label="Response Body" data={delivery.responseBody} />
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>
          URL:{" "}
          <code className="font-mono">{delivery.requestUrl}</code>
        </span>
        <span>Attempt: {delivery.attempt}</span>
        {delivery.duration !== undefined && (
          <span>Duration: {delivery.duration}ms</span>
        )}
      </div>
    </div>
  );
}
