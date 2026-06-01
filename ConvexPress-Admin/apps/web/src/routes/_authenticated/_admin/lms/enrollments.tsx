/**
 * Global enrollment management — /lms/enrollments
 */

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, RefreshCcw, Search, UserMinus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/_admin/lms/enrollments")({
  component: EnrollmentsPage,
});

type EnrollmentStatus = "active" | "expired" | "revoked" | "all";

type EnrollmentRow = {
  enrollmentId: string;
  userId: string;
  courseId: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  courseSlug?: string;
  source: string;
  status: "active" | "expired" | "revoked";
  enrolledAt: number;
  expiresAt?: number;
};

function EnrollmentsPage() {
  const { can } = useAuth();
  const canManageEnrollments = can("lms.enroll.manage");
  const [status, setStatus] = useState<EnrollmentStatus>("active");
  const [search, setSearch] = useState("");
  const args = useMemo(
    () => ({
      status,
      search: search.trim() || undefined,
      limit: 150,
    }),
    [search, status],
  );
  const rows = useQuery(
    (api as any).lms.enrollment.queries.listEnrollments,
    canManageEnrollments ? args : "skip",
  ) as EnrollmentRow[] | undefined;
  const unenroll = useMutation(api.lms.enrollment.mutations.unenroll);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link
        to="/lms"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        LMS overview
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Enrollments</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Search learner access across courses, audit source and expiry, and revoke access.
          </p>
        </div>
        <Link
          to="/lms/courses"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <RefreshCcw className="h-4 w-4" />
          Courses
        </Link>
      </div>

      <div className="mb-4 grid gap-3 border border-border bg-card p-4 md:grid-cols-[1fr_12rem]">
        <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Search enrollments</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={!canManageEnrollments}
            placeholder="Search by learner, email, course, source, or status"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as EnrollmentStatus)}
            disabled={!canManageEnrollments}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {!canManageEnrollments ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Enrollment management is not available for your role.
        </div>
      ) : rows === undefined ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No enrollments match this view.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Learner</th>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Enrolled</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.enrollmentId} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.learnerName}</div>
                    <div className="text-xs text-muted-foreground">{row.learnerEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to="/lms/courses/$courseId"
                      params={{ courseId: row.courseId }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {row.courseTitle}
                    </Link>
                    {row.courseSlug ? (
                      <div className="text-xs text-muted-foreground">{row.courseSlug}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSource(row.source)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(row.enrolledAt)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.expiresAt ? formatDate(row.expiresAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title="Revoke enrollment"
                      disabled={row.status !== "active"}
                      onClick={async () => {
                        try {
                          await unenroll({
                            courseId: row.courseId as Id<"lms_courses">,
                            userId: row.userId as Id<"users">,
                          });
                          toast.success("Enrollment revoked");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed");
                        }
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: EnrollmentRow["status"] }) {
  const label = status[0].toUpperCase() + status.slice(1);
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
      {label}
    </span>
  );
}

function formatSource(source: string) {
  return source
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
