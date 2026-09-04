/**
 * Depot · dashboard.lesson — the lesson player: course outline 3/12 (progress
 * box, dense lesson rows with lock / done state) beside the lesson 9/12
 * (video, body, materials, tracked time, previous / mark complete / next)
 * and the certificate / completion box. Same gates, actions and URL safety
 * as Core; every query and mutation lives in the loader.
 */
import { Link } from "@tanstack/react-router";
import { Award, BookOpen, CheckCircle2, Circle, Lock, PlayCircle } from "lucide-react";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { formatIssuedDate, getVideoEmbedUrl, safeVideoUrl } from "@/lib/lms/lessonPlayer";
import { cn } from "@/lib/utils";
import type { DashboardLessonSurfaceData } from "@/templates/packs/core/surfaces/dashboard.lesson";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Card, Label, Skeleton, buttonClasses } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { BackLink, Progress } from "../parts/extra-dashboard";

export default function DepotDashboardLesson({ data }: SurfaceProps<DashboardLessonSurfaceData>) {
  if (data.status === "loading") return <PlayerSkeleton />;
  if (data.status === "notFound" || !data.course || !data.progress) return <NotFoundPage />;

  const { course, topics, outline, progress, lesson, nodeProgress, lessonLocked, lockReason, videoUrl, completion, previousLesson, nextLesson, certificate, completionRedirectUrl, hrefs, actions, nodeId } = data;
  const showCompletion = progress.percent >= 100 && (course.certificateId || completionRedirectUrl);

  return (
    <div data-slot="dashboard-lesson" data-pack="depot" className="grid gap-4 xl:grid-cols-12 xl:items-start">
      <aside className="flex flex-col gap-3 xl:col-span-3">
        <BackLink to={hrefs.courses}>My courses</BackLink>

        <Card className="flex flex-col gap-2 p-3">
          <Label>Course</Label>
          <h1 className="text-sm font-semibold leading-5 text-foreground">{course.title}</h1>
          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span>
              {progress.completedCount} of {progress.total} lessons
            </span>
            <span className="font-semibold text-foreground">{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} label="Course progress" />
        </Card>

        <nav aria-label="Course lessons" className="flex flex-col gap-3">
          {topics.map((topic) => (
            <Card as="section" key={topic._id} className="overflow-hidden">
              <h2 className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{topic.title}</h2>
              <ul role="list" className="flex flex-col divide-y divide-border">
                {topic.children
                  .filter((child) => child.kind === "lesson")
                  .map((child) => {
                    const state = outline[child._id] ?? { completed: false, locked: false };
                    const current = child._id === nodeId;
                    return (
                      <li key={child._id}>
                        <Link
                          to={hrefs.lesson(child._id)}
                          aria-current={current ? "page" : undefined}
                          title={state.locked ? state.lockTitle : undefined}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-[13px] leading-5 transition-colors",
                            current ? "bg-primary/10 font-semibold text-primary" : state.locked ? "text-muted-foreground hover:bg-muted" : "text-foreground hover:bg-muted",
                          )}
                        >
                          {state.locked ? <Lock className="size-3.5 shrink-0" aria-hidden="true" /> : state.completed ? <CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-hidden="true" /> : <Circle className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />}
                          <span className="line-clamp-2">{child.title}</span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col gap-4 xl:col-span-9">
        <Card className="p-4 md:p-5">
          {lessonLocked || !lesson ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
              <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-foreground">Lesson locked</h2>
              <p className="max-w-md text-[13px] leading-5 text-muted-foreground">{lockReason}</p>
            </div>
          ) : (
            <article className="flex flex-col gap-4">
              <header className="flex flex-col gap-1 border-b border-border pb-4">
                <Label>Lesson</Label>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{lesson.node.title}</h2>
              </header>

              {videoUrl ? <VideoEmbed url={videoUrl} /> : null}

              <LessonContentRenderer doc={lesson.bodyDoc} fallbackText={lesson.bodyText} emptyLabel="Lesson content is being prepared." className="text-sm leading-6" />

              {lesson.materialsDoc || lesson.materialsText ? (
                <section className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
                  <h3 className="text-sm font-semibold text-foreground">Materials</h3>
                  <LessonContentRenderer doc={lesson.materialsDoc} fallbackText={lesson.materialsText} emptyLabel="No materials yet." className="space-y-3 text-sm leading-6" />
                </section>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="size-3.5" aria-hidden="true" />
                    {nodeProgress?.timeSpentSec ?? 0}s tracked
                  </span>
                  {lesson.node.requireVideoWatch ? (
                    <span className="inline-flex items-center gap-1">
                      <PlayCircle className="size-3.5" aria-hidden="true" />
                      {Math.round((nodeProgress?.videoWatchedFraction ?? 0) * 100)}% watched
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {previousLesson ? (
                    <Link to={hrefs.lesson(previousLesson._id)} className={buttonClasses("secondary", "sm")}>
                      Previous lesson
                    </Link>
                  ) : null}

                  {nodeProgress?.completed ? (
                    <Button variant="secondary" size="sm" onClick={() => void actions.markIncomplete()}>
                      Mark incomplete
                    </Button>
                  ) : lesson.node.showMarkComplete === false ? null : (
                    <Button size="sm" disabled={!completion.canComplete} onClick={() => void actions.markComplete()} title={completion.canComplete ? undefined : completion.requirements.join(" ")}>
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Mark complete
                    </Button>
                  )}

                  {nextLesson ? (
                    <Link to={hrefs.lesson(nextLesson._id)} className={buttonClasses("secondary", "sm")}>
                      Next lesson
                    </Link>
                  ) : null}
                </div>
              </div>

              {!nodeProgress?.completed && lesson.node.showMarkComplete !== false && completion.requirements.length > 0 ? <Notice>{completion.requirements.join(" ")}</Notice> : null}
            </article>
          )}
        </Card>

        {showCompletion ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <Award className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-foreground">{course.certificateId ? "Certificate" : "Course complete"}</h2>
                <p className="text-[13px] text-muted-foreground">
                  {course.certificateId ? (certificate ? `Issued ${formatIssuedDate(certificate.issuedAt)}` : "Your course is complete. Issue your certificate.") : "Your course is complete. Continue with the next step."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {completionRedirectUrl ? (
                <a href={completionRedirectUrl} className={buttonClasses("primary", "sm")}>
                  Continue
                </a>
              ) : null}
              {course.certificateId ? (
                certificate ? (
                  <>
                    {certificate.pdfUrl ? (
                      <a href={certificate.pdfUrl} target="_blank" rel="noreferrer" className={buttonClasses("primary", "sm")}>
                        Download PDF
                      </a>
                    ) : null}
                    <Link to={hrefs.certificate(certificate.serial)} className={buttonClasses("secondary", "sm")}>
                      View certificate
                    </Link>
                  </>
                ) : (
                  <Button size="sm" onClick={() => void actions.issueCertificate()}>
                    Issue certificate
                  </Button>
                )
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-12 xl:items-start" aria-hidden="true">
      <div className="flex flex-col gap-3 xl:col-span-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-[32rem] w-full xl:col-span-9" />
    </div>
  );
}

function VideoEmbed({ url }: { url: string }) {
  const safeUrl = safeVideoUrl(url);
  if (!safeUrl) return null;
  const src = getVideoEmbedUrl(safeUrl);

  if (src) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-muted">
        <iframe title="Lesson video" className="aspect-video w-full" src={src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  return (
    <a href={safeUrl} target="_blank" rel="noreferrer" className="inline-flex text-[13px] font-medium text-primary hover:underline">
      Open lesson video
    </a>
  );
}
