import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Inbox } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/form-submissions/",
)({
  component: FormSubmissionsIndex,
});

type SubmissionRow = {
  _id: Id<"commerce_subscription_form_submissions">;
  email: string;
  status: string;
  formTitle?: string;
  submittedAt: number;
};

function FormSubmissionsIndex() {
  const rows = useQuery(
    (api as any).commerceSubscriptions.queries.listFormSubmissions,
    {},
  ) as SubmissionRow[] | null | undefined;

  const pluginDisabled = rows === null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Form Submissions</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Direct-signup form submissions from customers.
        </p>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_150px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Email</div>
            <div>Form</div>
            <div>Status</div>
            <div>Submitted</div>
          </div>
          {rows === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <Inbox className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No submissions yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row._id}>
                  <Link
                    to="/commerce/subscriptions/form-submissions/$submissionId"
                    params={{ submissionId: String(row._id) }}
                    className="grid grid-cols-[1.5fr_1fr_1fr_150px] items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/30"
                  >
                    <div className="truncate font-medium text-foreground">{row.email}</div>
                    <div className="truncate text-muted-foreground">{row.formTitle ?? "—"}</div>
                    <div className="truncate capitalize text-foreground">{row.status}</div>
                    <div className="text-muted-foreground">
                      {new Date(row.submittedAt).toLocaleString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
