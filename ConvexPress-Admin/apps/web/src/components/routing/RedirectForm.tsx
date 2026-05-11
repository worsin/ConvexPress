/**
 * Redirect Form Component
 *
 * Shared form for creating and editing redirect rules.
 * Used by both the "Add New Redirect" and "Edit Redirect" pages.
 *
 * Fields:
 *   - Source URL (text input, required)
 *   - Target URL (text input, required)
 *   - Status Code (select: 301/302/307/308)
 *   - Match Type (select: exact/prefix/regex)
 *   - Note (textarea, optional)
 *
 * Wired to real Convex mutations: routing.mutations.createRedirect / updateRedirect.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { ArrowLeftIcon, LoaderIcon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, getErrorMessage } from "@/lib/utils";
import type { Id } from "@backend/convex/_generated/dataModel";

// ─── Types ──────────────────────────────────────────────────────────────────

type StatusCode = 301 | 302 | 307 | 308;
type MatchType = "exact" | "prefix" | "regex";

interface RedirectFormData {
  sourceUrl: string;
  targetUrl: string;
  statusCode: StatusCode;
  matchType: MatchType;
  note: string;
  enabled?: boolean;
}

interface RedirectFormProps {
  /** Mode: "create" for new redirects, "edit" for editing existing. */
  mode: "create" | "edit";
  /** Redirect ID for edit mode. */
  redirectId?: Id<"redirects">;
  /** Initial values for edit mode. */
  initialValues?: Partial<RedirectFormData>;
  /** Pre-filled source URL (from 404 log "Create Redirect" action). */
  prefillSourceUrl?: string;
}

const STATUS_CODES: { value: StatusCode; label: string; description: string }[] = [
  { value: 301, label: "301 - Moved Permanently", description: "SEO-friendly, cached by browsers" },
  { value: 302, label: "302 - Found (Temporary)", description: "Not cached by browsers" },
  { value: 307, label: "307 - Temporary Redirect", description: "Preserves HTTP method" },
  { value: 308, label: "308 - Permanent Redirect", description: "Preserves HTTP method, cached" },
];

const MATCH_TYPES: { value: MatchType; label: string; description: string }[] = [
  { value: "exact", label: "Exact Match", description: "URL must match exactly" },
  { value: "prefix", label: "Prefix Match", description: "Matches URL prefix (e.g., /old/* -> /new/*)" },
  { value: "regex", label: "Regular Expression", description: "Advanced pattern matching" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function RedirectForm({
  mode,
  redirectId,
  initialValues,
  prefillSourceUrl,
}: RedirectFormProps) {
  const navigate = useNavigate();
  const createRedirect = useMutation(api.routing.mutations.createRedirect);
  const updateRedirect = useMutation(api.routing.mutations.updateRedirect);

  const [isSaving, setIsSaving] = useState(false);

  const [sourceUrl, setSourceUrl] = useState(
    initialValues?.sourceUrl || prefillSourceUrl || "",
  );
  const [targetUrl, setTargetUrl] = useState(initialValues?.targetUrl || "");
  const [statusCode, setStatusCode] = useState<StatusCode>(
    initialValues?.statusCode || 301,
  );
  const [matchType, setMatchType] = useState<MatchType>(
    initialValues?.matchType || "exact",
  );
  const [note, setNote] = useState(initialValues?.note || "");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);

      try {
        if (mode === "create") {
          await createRedirect({
            sourceUrl: sourceUrl.trim(),
            targetUrl: targetUrl.trim(),
            statusCode,
            matchType,
            note: note.trim() || undefined,
          });
          toast.success("Redirect created successfully.");
          navigate({ to: "/tools/redirects" });
        } else if (mode === "edit" && redirectId) {
          await updateRedirect({
            redirectId,
            sourceUrl: sourceUrl.trim(),
            targetUrl: targetUrl.trim(),
            statusCode,
            matchType,
            note: note.trim() || undefined,
          });
          toast.success("Redirect updated successfully.");
          navigate({ to: "/tools/redirects" });
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error, "Failed to save redirect.");
        toast.error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [
      mode,
      redirectId,
      sourceUrl,
      targetUrl,
      statusCode,
      matchType,
      note,
      createRedirect,
      updateRedirect,
      navigate,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Source URL */}
      <div className="space-y-1.5">
        <Label htmlFor="sourceUrl" className="font-medium">
          Source URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="sourceUrl"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="/old-path/"
          required
        />
        <p className="text-[10px] text-muted-foreground">
          {matchType === "regex"
            ? "Enter a regular expression pattern (e.g., ^/old-section/(.*))."
            : "Must start with /. No query strings or fragments."}
        </p>
      </div>

      {/* Target URL */}
      <div className="space-y-1.5">
        <Label htmlFor="targetUrl" className="font-medium">
          Target URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="targetUrl"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="/new-path/"
          required
        />
        <p className="text-[10px] text-muted-foreground">
          Relative path (/) or absolute HTTPS URL.
          {matchType === "regex" && " Use $1, $2, etc. for captured groups."}
        </p>
      </div>

      {/* Status Code */}
      <div className="space-y-1.5">
        <Label htmlFor="statusCode" className="font-medium">
          Status Code
        </Label>
        <select
          id="statusCode"
          value={statusCode}
          onChange={(e) => setStatusCode(Number(e.target.value) as StatusCode)}
          className="h-8 w-full rounded-none border border-input bg-transparent px-2.5 text-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          {STATUS_CODES.map((sc) => (
            <option key={sc.value} value={sc.value}>
              {sc.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground">
          {STATUS_CODES.find((sc) => sc.value === statusCode)?.description}
        </p>
      </div>

      {/* Match Type */}
      <div className="space-y-1.5">
        <Label htmlFor="matchType" className="font-medium">
          Match Type
        </Label>
        <select
          id="matchType"
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as MatchType)}
          className="h-8 w-full rounded-none border border-input bg-transparent px-2.5 text-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          {MATCH_TYPES.map((mt) => (
            <option key={mt.value} value={mt.value}>
              {mt.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground">
          {MATCH_TYPES.find((mt) => mt.value === matchType)?.description}
        </p>
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <Label htmlFor="note" className="font-medium">
          Note
        </Label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note explaining this redirect..."
          maxLength={500}
          rows={3}
          className="w-full rounded-none border border-input bg-transparent px-2.5 py-1.5 text-xs outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 resize-none"
        />
        <p className="text-[10px] text-muted-foreground">
          {note.length}/500 characters
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving && <LoaderIcon className="mr-1.5 size-3 animate-spin" />}
          <SaveIcon className="mr-1.5 size-3" />
          {mode === "create" ? "Create Redirect" : "Update Redirect"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/tools/redirects" })}
          disabled={isSaving}
        >
          <ArrowLeftIcon className="mr-1.5 size-3" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
