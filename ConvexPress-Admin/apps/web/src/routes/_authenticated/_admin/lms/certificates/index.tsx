/**
 * Certificate templates — /lms/certificates
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { Award, Ban, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/certificates/")({
  component: CertificatesPage,
});

function CertificatesPage() {
  const templates = useQuery(api.lms.certificates.queries.listTemplates, {}) as
    | Array<{ _id: string; title: string; orientation: string; isActive: boolean }>
    | undefined;
  const [showIssues, setShowIssues] = useState(false);
  const issues = useQuery(
    (api as any).lms.certificates.queries.listIssues,
    showIssues ? {} : "skip",
  ) as
    | Array<{
        _id: Id<"lms_certificate_issues">;
        serial: string;
        status: "issued" | "revoked";
        learnerName: string;
        courseTitle: string;
        issuedAt: number;
      }>
    | undefined;
  const create = useMutation(api.lms.certificates.mutations.createTemplate);
  const remove = useMutation(api.lms.certificates.mutations.deleteTemplate);
  const revokeIssue = useMutation((api as any).lms.certificates.mutations.revokeIssue);
  const [title, setTitle] = useState("");

  async function addTemplate() {
    if (!title.trim()) {
      toast.error("Enter a template title");
      return;
    }
    try {
      await create({ title: title.trim() });
      toast.success("Template created");
      setTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Award className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Certificate Templates</h1>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-lg border border-border p-3">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addTemplate();
          }}
          placeholder="New certificate template title…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void addTemplate()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Create
        </button>
      </div>

      {templates === undefined ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <Award className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No certificate templates yet. Create one, then assign it to a course.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Orientation</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t._id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.orientation}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      {t.isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title="Delete"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${t.title}"?`)) return;
                        try {
                          await remove({ certificateId: t._id as Id<"lms_certificates"> });
                          toast.success("Deleted");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed");
                        }
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Issued certificates
          </h2>
          {!showIssues && (
            <button
              type="button"
              onClick={() => setShowIssues(true)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Load issued certificates
            </button>
          )}
        </div>
        {!showIssues ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Issued certificate records are not loaded.
          </div>
        ) : issues === undefined ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : issues.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No certificates have been issued yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Learner</th>
                  <th className="px-4 py-2 font-medium">Course</th>
                  <th className="px-4 py-2 font-medium">Serial</th>
                  <th className="px-4 py-2 font-medium">Issued</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue._id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{issue.learnerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{issue.courseTitle}</td>
                    <td className="px-4 py-3 font-mono text-xs">{issue.serial}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(issue.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {issue.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {issue.status === "issued" && (
                        <button
                          type="button"
                          title="Revoke certificate"
                          onClick={async () => {
                            if (!window.confirm(`Revoke certificate ${issue.serial}?`)) return;
                            try {
                              await revokeIssue({ issueId: issue._id });
                              toast.success("Certificate revoked");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed");
                            }
                          }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
