/**
 * Managed records: a site's own code keeps some records in shape (a signup
 * form whose answers it reads, the plans it sells), and the backend refuses
 * admin edits to them. These pieces say so up front: a note naming who manages
 * the record and where it's changed instead, and a read-only wrapper around
 * its editor.
 */
import type { ReactNode } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { Lock } from "lucide-react";

import type { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";

type ForRecord = typeof api.managedRecords.queries.forRecord;
export type ManagedTable = FunctionArgs<ForRecord>["tableName"];
export type ManagedInfo = NonNullable<FunctionReturnType<ForRecord>>;

export function ManagedRecordNotice({ managed, what, className }: { managed: ManagedInfo; what: string; className?: string }) {
  return (
    <div role="note" className={cn("flex gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm", className)}>
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">
          {what} is managed by {managed.system}, so it's read-only here.
        </p>
        {managed.note ? <p className="text-muted-foreground">{managed.note}</p> : null}
      </div>
    </div>
  );
}

/**
 * Shows the note and turns every control inside read-only while the record is
 * managed. A disabled fieldset disables its inputs, selects and buttons, so an
 * editor needs no changes of its own; links still navigate.
 */
export function ManagedRecordGate({
  managed,
  what,
  children,
}: {
  managed: ManagedInfo | null | undefined;
  what: string;
  children: ReactNode;
}) {
  if (!managed) return <>{children}</>;
  return (
    <div className="space-y-6">
      <ManagedRecordNotice managed={managed} what={what} />
      <fieldset disabled className="min-w-0">
        {children}
      </fieldset>
    </div>
  );
}
