/**
 * Issue a new membership grant (admin-only manual grant).
 *
 * Pick a user, pick a plan, set optional dates + notes. Saves via
 * api.membership.mutations.grantMembership.
 */

import { useMemo, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, Search, UserRound } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PlanPicker } from "@/components/membership/PlanPicker";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/grants/new",
)({
  component: NewGrantPage,
});

type SourceType = "manual" | "subscription" | "purchase" | "import";

type UserRow = {
  _id: Id<"users">;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
};

function NewGrantPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(
    null,
  );
  const [selectedPlanId, setSelectedPlanId] =
    useState<Id<"membership_plans"> | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("manual");
  const [sourceRef, setSourceRef] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const usersResult = useQuery(
    (api as any).profiles.queries.listUsers,
    {
      search: search.trim() || undefined,
      page: 1,
      perPage: 10,
      orderBy: "displayName",
      orderDir: "asc",
    },
  ) as
    | {
        users: UserRow[];
        total: number;
      }
    | undefined;

  const selectedUser = useQuery(
    (api as any).profiles.queries.getUser,
    selectedUserId ? { userId: selectedUserId } : "skip",
  ) as UserRow | null | undefined;

  const grant = useMutation(
    (api as any).membership.mutations.grantMembership,
  );

  const canSubmit = useMemo(
    () => !!selectedUserId && !!selectedPlanId,
    [selectedUserId, selectedPlanId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId || !selectedPlanId) {
      toast.error("Select a user and a plan.");
      return;
    }
    setSubmitting(true);
    try {
      const startTs = startsAt ? new Date(startsAt).getTime() : undefined;
      const endTs = endsAt ? new Date(endsAt).getTime() : undefined;

      await grant({
        userId: selectedUserId,
        planId: selectedPlanId,
        sourceType,
        sourceRef: sourceRef.trim() || undefined,
        startsAt: startTs,
        endsAt: endTs,
        metadata: notes.trim() ? { adminNotes: notes.trim() } : undefined,
      });
      toast.success("Grant created");
      navigate({ to: "/membership/grants" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create grant",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            to="/membership/grants"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to grants
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">New Grant</h1>
          <p className="text-sm text-muted-foreground">
            Manually issue a membership to a user. Use this for compensated
            members, legacy imports, or one-off grants.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/membership/grants" })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Issue grant"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User picker */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">User</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The user who will receive this grant.
          </p>

          {selectedUser ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  {selectedUser.avatarUrl ? (
                    // Avatars are served from media — plain img to avoid layout hooks
                    <img
                      src={selectedUser.avatarUrl}
                      alt=""
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {selectedUser.displayName || selectedUser.email}
                  </p>
                  {selectedUser.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedUser.email}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users by name or email..."
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-background">
                {usersResult === undefined ? (
                  <div className="space-y-1.5 p-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-10 animate-pulse rounded-lg bg-muted"
                      />
                    ))}
                  </div>
                ) : usersResult.users.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No users found.
                  </div>
                ) : (
                  <ul className="divide-y divide-border/70">
                    {usersResult.users.map((u) => (
                      <li key={u._id}>
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(u._id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                        >
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                            {u.avatarUrl ? (
                              <img
                                src={u.avatarUrl}
                                alt=""
                                className="size-7 rounded-full object-cover"
                              />
                            ) : (
                              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium text-foreground">
                              {u.displayName || u.email || "(no name)"}
                            </span>
                            {u.email && (
                              <span className="truncate text-xs text-muted-foreground">
                                {u.email}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Plan picker */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Plan</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only active plans can be granted. Draft or archived plans are
            hidden.
          </p>
          <div className="mt-4">
            <PlanPicker
              value={selectedPlanId}
              onChange={setSelectedPlanId}
              emptyLabel="No active plans — activate one to issue grants."
            />
          </div>
        </section>

        {/* Source + dates */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold">Grant details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Source type">
              <select
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as SourceType)
                }
                className={inputClass}
              >
                <option value="manual">Manual</option>
                <option value="subscription">Subscription</option>
                <option value="purchase">Purchase</option>
                <option value="import">Import</option>
              </select>
            </Field>
            <Field
              label="Source reference"
              helper="Optional opaque ID (e.g., support ticket, order number)."
            >
              <input
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                className={inputClass}
                placeholder="e.g., TICKET-1234"
              />
            </Field>
            <Field
              label="Starts at"
              helper="Leave blank to start immediately."
            >
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field
              label="Ends at"
              helper="Leave blank for a never-expiring grant."
            >
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Admin notes" className="sm:col-span-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={cn(inputClass, "h-auto py-2.5")}
                placeholder="Internal notes saved to grant metadata."
              />
            </Field>
          </div>
        </section>
      </div>
    </form>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  label,
  helper,
  className,
  children,
}: {
  label: string;
  helper?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {helper && (
        <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}
