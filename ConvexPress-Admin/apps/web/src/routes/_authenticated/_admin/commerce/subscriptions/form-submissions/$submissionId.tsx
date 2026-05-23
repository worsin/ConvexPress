import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ArrowLeft } from "lucide-react";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/form-submissions/$submissionId",
)({
  component: FormSubmissionDetail,
});

function FormSubmissionDetail() {
  const { submissionId } = Route.useParams();
  const submission = useQuery(
    (api as any).commerceSubscriptions.queries.getFormSubmission,
    { submissionId: submissionId as any },
  ) as
    | {
        _id: string;
        email?: string;
        status?: string;
        createdAt?: number;
        fields?: Record<string, unknown>;
      }
    | null
    | undefined;

  if (submission === undefined) {
    return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  }
  if (submission === null) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-muted-foreground">Submission not found.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Link
        to="/commerce/subscriptions/form-submissions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to submissions
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {submission.email ?? "(no email)"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted {submission.createdAt ? new Date(submission.createdAt).toLocaleString() : "—"}
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Status</div>
          <div className="mt-1 text-sm capitalize text-foreground">{submission.status ?? "pending"}</div>
        </div>
        {submission.fields && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Fields</div>
            <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(submission.fields, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
