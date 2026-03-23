/**
 * AuditPayloadViewer Component
 *
 * JSON viewer with syntax highlighting, copy to clipboard, and collapsible sections.
 */

import { useState, useCallback } from "react";
import { CopyIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AuditPayloadViewerProps {
  payload: Record<string, unknown>;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Label for the section */
  label?: string;
}

export function AuditPayloadViewer({
  payload,
  defaultCollapsed = true,
  label = "Raw Payload",
}: AuditPayloadViewerProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(payload, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: create a temporary textarea
      const textarea = document.createElement("textarea");
      textarea.value = jsonString;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [jsonString]);

  // Check if payload is essentially empty
  const isEmpty =
    !payload || Object.keys(payload).length === 0;

  if (isEmpty) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No payload data available.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
          {label}
          <span className="text-[11px] text-muted-foreground font-normal">
            ({Object.keys(payload).length} fields)
          </span>
        </button>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="size-3 text-primary" />
          ) : (
            <CopyIcon className="size-3" />
          )}
        </Button>
      </div>

      {/* JSON content */}
      {!collapsed && (
        <div className="p-3 overflow-x-auto max-h-[400px] overflow-y-auto">
          <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all">
            {jsonString}
          </pre>
        </div>
      )}
    </div>
  );
}
