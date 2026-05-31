/**
 * LMS Overview
 *
 * Landing page for the LMS admin section. Links into the core authoring
 * surfaces (Courses, Certificates, Settings).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, BookOpen, Award, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/")({
  component: LMSOverview,
});

const CARDS = [
  {
    to: "/lms/courses" as const,
    icon: BookOpen,
    title: "Courses",
    desc: "Create and manage courses, topics, and lessons.",
  },
  {
    to: "/lms/certificates" as const,
    icon: Award,
    title: "Certificates",
    desc: "Design completion certificate templates.",
  },
  {
    to: "/lms/settings" as const,
    icon: Settings,
    title: "Settings",
    desc: "Configure LMS defaults and AI generation.",
  },
];

function LMSOverview() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-2 flex items-center gap-3">
        <GraduationCap className="h-7 w-7" />
        <h1 className="text-2xl font-semibold">LMS — Courses</h1>
      </div>
      <p className="mb-8 text-sm text-muted-foreground">
        Build courses from topics and lessons, generate them with AI, and deliver
        them to learners.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
