/**
 * Course enrollees (admin) — /lms/courses/$courseId/enrollees
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, Users, UserMinus, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/enrollees",
)({
  component: EnrolleesPage,
});

function EnrolleesPage() {
  const { can } = useAuth();
  const canManageEnrollments = can("lms.enroll.manage");
  const { courseId } = Route.useParams();
  const id = courseId as Id<"lms_courses">;
  const rows = useQuery(
    api.lms.enrollment.queries.listEnrolleesForCourse,
    canManageEnrollments ? { courseId: id } : "skip",
  ) as
    | Array<{ userId: string; name: string; email: string; source: string; enrolledAt: number }>
    | undefined;
  const unenroll = useMutation(api.lms.enrollment.mutations.unenroll);
  const enrollByEmail = useMutation(api.lms.enrollment.mutations.enrollByEmail);
  const [email, setEmail] = useState("");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        to="/lms/courses/$courseId"
        params={{ courseId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Enrollees</h1>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canManageEnrollments) {
            toast.error("You do not have permission to manage enrollments.");
            return;
          }
          if (!email.trim()) return;
          try {
            await enrollByEmail({ courseId: id, email: email.trim() });
            toast.success("Enrolled");
            setEmail("");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
          }
        }}
        className="mb-6 flex items-center gap-2 rounded-lg border border-border p-3"
      >
        <UserPlus className="h-4 w-4 text-muted-foreground" />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canManageEnrollments}
          placeholder="Enroll a learner by email…"
          className="flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canManageEnrollments}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enroll
        </button>
      </form>

      {!canManageEnrollments ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Enrollment management is not available for your role.
        </div>
      ) : rows === undefined ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No active enrollees yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Enrolled</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.source}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(r.enrolledAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title="Unenroll"
                      disabled={!canManageEnrollments}
                      onClick={async () => {
                        try {
                          await unenroll({ courseId: id, userId: r.userId as Id<"users"> });
                          toast.success("Unenrolled");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed");
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
