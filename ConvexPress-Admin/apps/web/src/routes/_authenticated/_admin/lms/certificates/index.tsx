/**
 * Certificate templates — /lms/certificates
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { Award, Ban, CheckCircle2, Copy, Download, Eye, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/_admin/lms/certificates/")({
  component: CertificatesPage,
});

type CertificateTemplate = {
  _id: Id<"lms_certificates">;
  title: string;
  orientation: "landscape" | "portrait";
  isActive: boolean;
  templateDoc?: unknown;
  updatedAt?: number;
};

type CertificateIssue = {
  _id: Id<"lms_certificate_issues">;
  serial: string;
  status: "issued" | "revoked";
  learnerName: string;
  courseTitle: string;
  issuedAt: number;
  pdfUrl?: string;
  revokedAt?: number;
  revocationReason?: string;
};

type TemplateDraft = {
  title: string;
  orientation: "landscape" | "portrait";
  isActive: boolean;
  templateText: string;
};

const defaultTemplateText =
  "Certificate of Completion\n\nAwarded to {{learner_name}} for completing {{course_title}}.\n\nIssued {{completion_date}}\nSerial {{serial}}";

const sampleValues: Record<string, string> = {
  learnerName: "Alex Learner",
  learner_name: "Alex Learner",
  courseTitle: "Foundations of ConvexPress",
  course_title: "Foundations of ConvexPress",
  issuedDate: new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
  issued_date: new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
  completionDate: new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
  completion_date: new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
  serial: "CERT-SAMPLE-000001",
  certificateTitle: "Certificate of Completion",
  certificate_title: "Certificate of Completion",
  points: "10",
};

function CertificatesPage() {
  const { can } = useAuth();
  const canManageCertificates = can("lms.certificate.manage");
  const templates = useQuery(
    api.lms.certificates.queries.listTemplates,
    canManageCertificates ? {} : "skip",
  ) as
    | CertificateTemplate[]
    | undefined;
  const [showIssues, setShowIssues] = useState(false);
  const issues = useQuery(
    (api as any).lms.certificates.queries.listIssues,
    showIssues && canManageCertificates ? {} : "skip",
  ) as CertificateIssue[] | undefined;

  const create = useMutation(api.lms.certificates.mutations.createTemplate);
  const update = useMutation(api.lms.certificates.mutations.updateTemplate);
  const remove = useMutation(api.lms.certificates.mutations.deleteTemplate);
  const revokeIssue = useMutation((api as any).lms.certificates.mutations.revokeIssue);
  const reissueIssue = useMutation((api as any).lms.certificates.mutations.reissueIssue);

  const [title, setTitle] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"lms_certificates"> | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => templates?.find((template) => template._id === selectedId) ?? templates?.[0] ?? null,
    [selectedId, templates],
  );
  const savedDraft = selected ? draftFromTemplate(selected) : null;
  const dirty = !!draft && !!savedDraft && snapshotDraft(draft) !== snapshotDraft(savedDraft);
  const previewText = renderTokens(draft?.templateText ?? defaultTemplateText, {
    ...sampleValues,
    certificateTitle: draft?.title || sampleValues.certificateTitle,
  });

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected._id);
    setDraft(draftFromTemplate(selected));
  }, [selected?._id]);

  async function addTemplate() {
    if (!canManageCertificates) {
      toast.error("You do not have permission to manage certificates.");
      return;
    }
    if (!title.trim()) {
      toast.error("Enter a template title");
      return;
    }
    try {
      const certificateId = await create({ title: title.trim() });
      toast.success("Template created");
      setTitle("");
      setSelectedId(certificateId as Id<"lms_certificates">);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveTemplate() {
    if (!canManageCertificates) {
      toast.error("You do not have permission to manage certificates.");
      return;
    }
    if (!selected || !draft) return;
    if (!draft.title.trim()) {
      toast.error("Template title is required");
      return;
    }
    setSaving(true);
    try {
      await update({
        certificateId: selected._id,
        title: draft.title.trim(),
        orientation: draft.orientation,
        isActive: draft.isActive,
        templateDoc: textToDoc(draft.templateText),
      });
      toast.success("Template saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  function setDraftValue<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Award className="size-6" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">Certificate Templates</h1>
            <p className="text-sm text-muted-foreground">
              Manage LMS completion certificates, verification text, and issued records.
            </p>
          </div>
        </div>
        {draft && selected ? (
          <button
            type="button"
            onClick={() => void saveTemplate()}
            disabled={saving || !dirty || !canManageCertificates}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Save template
          </button>
        ) : null}
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-md border border-border p-3">
        <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!canManageCertificates}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addTemplate();
          }}
          placeholder="New certificate template title..."
          className="min-h-9 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => void addTemplate()}
          disabled={!canManageCertificates}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create
        </button>
      </div>

      {!canManageCertificates ? (
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Certificate management is not available for your role.
        </div>
      ) : templates === undefined ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-16 text-center">
          <Award className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No certificate templates yet. Create one, then assign it to a course.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="space-y-4">
            <div className="overflow-hidden rounded-md border border-border">
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
                  {templates.map((template) => (
                    <tr
                      key={template._id}
                      className={
                        selected?._id === template._id
                          ? "border-t border-border bg-primary/5"
                          : "border-t border-border"
                      }
                    >
                      <td className="px-4 py-3 font-medium">{template.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{template.orientation}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {template.isActive ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => setSelectedId(template._id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Eye className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={async () => {
                              if (!window.confirm(`Delete "${template.title}"?`)) return;
                              try {
                                await remove({ certificateId: template._id });
                                toast.success("Deleted");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Failed");
                              }
                            }}
                            disabled={!canManageCertificates}
                            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <IssuedCertificates
              issues={issues}
              showIssues={showIssues}
              onShowIssues={() => setShowIssues(true)}
              canRevoke={canManageCertificates}
              onRevoke={async (issue) => {
                if (!canManageCertificates) {
                  toast.error("You do not have permission to revoke certificates.");
                  return;
                }
                const reason = window.prompt(
                  `Reason for revoking ${issue.serial}?`,
                  "Certificate revoked by admin.",
                );
                if (reason === null) return;
                try {
                  await revokeIssue({ issueId: issue._id, reason });
                  toast.success("Certificate revoked");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              }}
              onReissue={async (issue) => {
                if (!canManageCertificates) {
                  toast.error("You do not have permission to reissue certificates.");
                  return;
                }
                try {
                  await reissueIssue({ issueId: issue._id });
                  toast.success("Certificate reissued");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              }}
            />
          </section>

          <aside className="space-y-4">
            <section className="rounded-md border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Template editor</h2>
              {!draft ? (
                <p className="text-sm text-muted-foreground">Select a template to edit it.</p>
              ) : (
                <div className="space-y-4">
                  <Field label="Title">
                    <input
                      value={draft.title}
                      onChange={(event) => setDraftValue("title", event.target.value)}
                      disabled={!canManageCertificates}
                      className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Orientation">
                      <select
                        value={draft.orientation}
                        onChange={(event) =>
                          setDraftValue(
                            "orientation",
                            event.target.value as TemplateDraft["orientation"],
                          )
                        }
                        disabled={!canManageCertificates}
                        className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <option value="landscape">Landscape</option>
                        <option value="portrait">Portrait</option>
                      </select>
                    </Field>
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) => setDraftValue("isActive", event.target.checked)}
                        disabled={!canManageCertificates}
                        className="size-4 rounded border-border accent-primary"
                      />
                      Active
                    </label>
                  </div>
                  <Field label="Template body">
                    <textarea
                      value={draft.templateText}
                      onChange={(event) => setDraftValue("templateText", event.target.value)}
                      disabled={!canManageCertificates}
                      rows={8}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </Field>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Tokens: {"{{learner_name}}"}, {"{{course_title}}"}, {"{{completion_date}}"},{" "}
                    {"{{serial}}"}, {"{{points}}"}, {"{{certificate_title}}"}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-md border border-border bg-card p-5">
              <div className="mb-5 flex items-center justify-center">
                <div className="rounded-full border border-primary/30 bg-primary/10 p-3 text-primary">
                  <Award className="size-8" aria-hidden="true" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Certificate Preview
                </p>
                <h3 className="mt-2 text-2xl font-semibold">{sampleValues.learnerName}</h3>
                <div className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
                  {previewText.split(/\n{2,}/).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function IssuedCertificates({
  issues,
  showIssues,
  onShowIssues,
  onRevoke,
  onReissue,
  canRevoke,
}: {
  issues: CertificateIssue[] | undefined;
  showIssues: boolean;
  onShowIssues: () => void;
  onRevoke: (issue: CertificateIssue) => Promise<void>;
  onReissue: (issue: CertificateIssue) => Promise<void>;
  canRevoke: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          Issued certificates
        </h2>
        {!showIssues ? (
          <button
            type="button"
            onClick={onShowIssues}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Load issued certificates
          </button>
        ) : null}
      </div>
      {!showIssues ? (
        <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Issued certificate records are not loaded.
        </div>
      ) : issues === undefined ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : issues.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No certificates have been issued yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Learner</th>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Serial</th>
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
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {issue.status === "issued" ? (
                        <CheckCircle2 className="size-3 text-primary" aria-hidden="true" />
                      ) : (
                        <Ban className="size-3 text-destructive" aria-hidden="true" />
                      )}
                      {issue.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {issue.pdfUrl ? (
                        <a
                          href={issue.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Download PDF"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Download className="size-4" aria-hidden="true" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        title="Copy serial"
                        onClick={() => void navigator.clipboard.writeText(issue.serial)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="size-4" aria-hidden="true" />
                      </button>
                      {issue.status === "issued" ? (
                        <button
                          type="button"
                          title="Revoke certificate"
                          onClick={() => void onRevoke(issue)}
                          disabled={!canRevoke}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Ban className="size-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Reissue certificate"
                          onClick={() => void onReissue(issue)}
                          disabled={!canRevoke}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <RotateCcw className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function draftFromTemplate(template: CertificateTemplate): TemplateDraft {
  return {
    title: template.title,
    orientation: template.orientation,
    isActive: template.isActive,
    templateText: docToText(template.templateDoc) || defaultTemplateText,
  };
}

function snapshotDraft(draft: TemplateDraft) {
  return JSON.stringify({
    ...draft,
    title: draft.title.trim(),
    templateText: draft.templateText.trim(),
  });
}

function textToDoc(text: string) {
  return {
    type: "doc",
    content: text.trim().split(/\n{2,}/).map((paragraph) => ({
      type: "paragraph",
      content: paragraph ? [{ type: "text", text: paragraph.replace(/\n/g, " ") }] : [],
    })),
  };
}

function docToText(doc: unknown): string {
  const value = doc as { content?: Array<{ type?: string; content?: unknown[] }> } | null;
  if (!value?.content) return "";
  return value.content.map(nodeToText).filter(Boolean).join("\n\n");
}

function nodeToText(node: unknown): string {
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === "text") return value.text ?? "";
  return (value.content ?? []).map(nodeToText).join(value.type === "paragraph" ? "" : "\n");
}

function renderTokens(text: string, values: Record<string, string>) {
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
}
