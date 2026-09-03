/**
 * Typed-confirmation dialog for destructive actions. The exact phrase must be
 * typed; the backend re-checks it, so this is a guard against slips, not the
 * only line of defence.
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkspaceApi } from "../SitesWorkspace";
import { ConfirmationField, Notice } from "../forms";
import { friendlyError } from "../useWorkspaceActions";

export interface ConfirmRequest {
  title: string;
  description: string;
  phrase: string;
  ariaLabel: string;
  confirmLabel: string;
  onConfirm: () => Promise<string | void>;
}

export function ConfirmDialog({ api, request }: { api: WorkspaceApi; request: ConfirmRequest }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = typed === request.phrase;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && api.closeDialog()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
            {request.title}
          </DialogTitle>
          <DialogDescription className="text-[13.5px] leading-6">{request.description}</DialogDescription>
        </DialogHeader>
        {error && <Notice tone="error">{error}</Notice>}
        <ConfirmationField
          phrase={request.phrase}
          value={typed}
          onChange={setTyped}
          ariaLabel={request.ariaLabel}
        />
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={api.closeDialog}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 bg-live-soft text-destructive hover:bg-live-soft/80"
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const result = await api.run("confirm", request.onConfirm, (message) =>
                typeof message === "string" ? message : "",
              );
              setBusy(false);
              if (result.ok) api.closeDialog();
              else setError(result.error ?? friendlyError(new Error("failed")));
            }}
          >
            {busy && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
            {request.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
