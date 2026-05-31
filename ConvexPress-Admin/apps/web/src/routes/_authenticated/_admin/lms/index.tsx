/**
 * LMS Overview — /lms
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { GraduationCap, BookOpen, Award, Settings, Compass } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/")({
  component: LMSOverview,
});

const CARDS = [
  { to: "/lms/courses" as const, icon: BookOpen, title: "Courses", desc: "Create and manage courses, topics, and lessons." },
  { to: "/lms/catalog" as const, icon: Compass, title: "Catalog", desc: "Browse published courses as a learner." },
  { to: "/lms/certificates" as const, icon: Award, title: "Certificates", desc: "Design completion certificate templates." },
  { to: "/lms/settings" as const, icon: Settings, title: "Settings", desc: "Configure LMS defaults and AI generation." },
];

function LMSOverview() {
  const stats = useQuery(api.lms.courses.queries.stats, {}) as
    | { total: number; published: number; draft: number; archived: number }
    | undefined;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-2 flex items-center gap-3">
        <GraduationCap className="h-7 w-7" />
        <h1 className="text-2xl font-semibold">LMS — Courses</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Build courses from topics and lessons, generate them with AI, and deliver
        them to learners.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total courses" value={stats?.total} />
        <Stat label="Published" value={stats?.published} accent="text-green-500" />
        <Stat label="Drafts" value={stats?.draft} accent="text-amber-500" />
        <Stat label="Archived" value={stats?.archived} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="rounded-lg border border-border bg-card p-5 transition hover:border-primary hover:shadow-sm"
          >
            <card.icon className="mb-3 h-6 w-6 text-muted-foreground" />
            <div className="font-medium">{card.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value?: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className={`text-2xl font-semibold ${accent ?? ""}`}>{value ?? "—"}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
