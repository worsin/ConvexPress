/**
 * Journal · dashboard.lesson — the lesson player read like an article: the
 * course outline as a quiet rail (small-caps topics, text links, lock and
 * completion state), the lesson body in the reading measure with the video
 * in a rounded frame, materials under a rule, then the small-caps tracking
 * line with the previous / complete / next pills, and the certificate row.
 * Every query, mutation and gate lives in the loader.
 */
import { Link } from "@tanstack/react-router";
import { Check, Lock } from "lucide-react";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { formatIssuedDate, getVideoEmbedUrl, safeVideoUrl } from "@/lib/lms/lessonPlayer";
import { cn } from "@/lib/utils";
import type { DashboardLessonSurfaceData } from "@/templates/packs/core/surfaces/dashboard.lesson";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, EmptyState, Eyebrow, LinkButton, Rule, SkeletonBlock, SkeletonText, SmallCaps, buttonClasses } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { BackLink, ProgressLine } from "../parts/extra-dashboard";

export default function JournalDashboardLesson({ data }: SurfaceProps<DashboardLessonSurfaceData>) {
  if (data.status === "loading") return <PlayerSkeleton />;
  if (data.status === "notFound" || !data.course || !data.progress) return <NotFoundPage />;

  const { course, topics, outline, progress, lesson, nodeProgress, lessonLocked, lockReason, videoUrl, completion, previousLesson, nextLesson, certificate, completionRedirectUrl, hrefs, actions, nodeId } = data;
  const showComplete = progress.percent >= 100 && (course.certificateId || completionRedirectUrl);

  return (
    <div data-slot="dashboard-lesson" className="grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
      {/* Outline */}
      <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
        <BackLink to={hrefs.courses}>My courses</BackLink>

        <div className="flex flex-col gap-3">
          <h1 className="font-display text-xl leading-snug tracking-tight text-foreground">{course.title}</h1>
          <ProgressLine percent={progress.percent} label={`${course.title} progress`} />
          <SmallCaps className="tabular-nums">
            {progress.completedCount} of {progress.total} lessons · {progress.percent}%
          </SmallCaps>
        </div>

        <Rule />

        <nav aria-label="Course lessons" className="flex flex-col gap-5">
          {topics.map((topic) => (
            <section key={topic._id} className="flex flex-col gap-1">
              <SmallCaps as="h2" className="pb-1">
                {topic.title}
              </SmallCaps>
              <ul role="list" className="flex flex-col">
                {topic.children
                  .filter((child) => child.kind === "lesson")
                  .map((child) => {
                    const state = outline[child._id] ?? { completed: false, locked: false };
                    const active = child._id === nodeId;
                    return (
                      <li key={child._id}>
                        <Link
                          to={hrefs.lesson(child._id) as any}
                          title={state.locked ? state.lockTitle : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn("flex items-start gap-2 py-1.5 text-sm leading-6 transition-colors", active ? "text-primary" : state.locked ? "text-muted-foreground/70 hover:text-muted-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                          <span className="mt-1.5 flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
                            {state.locked ? <Lock className="size-3" /> : state.completed ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current opacity-40" />}
                          </span>
                          <span className="line-clamp-2">{child.title}</span>
                          {state.locked ? <span className="sr-only">(locked)</span> : state.completed ? <span className="sr-only">(completed)</span> : null}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      {/* Lesson */}
      <div className="flex min-w-0 flex-col gap-12">
        {lessonLocked || !lesson ? (
          <EmptyState eyebrow="Lesson locked" title={lockReason} />
        ) : (
          <article className="flex flex-col gap-10">
            <header className="flex flex-col gap-4">
              <Eyebrow>Lesson</Eyebrow>
              <h2 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground text-balance md:text-4xl">{lesson.node.title}</h2>
            </header>

            {videoUrl ? <VideoEmbed url={videoUrl} /> : null}

            <LessonContentRenderer doc={lesson.bodyDoc} fallbackText={lesson.bodyText} emptyLabel="Lesson content is being prepared." className="text-base leading-8 text-muted-foreground md:text-[17px]" />

            {lesson.materialsDoc || lesson.materialsText ? (
              <section className="flex flex-col gap-4 border-t border-border pt-8">
                <SmallCaps as="h3">Materials</SmallCaps>
                <LessonContentRenderer doc={lesson.materialsDoc} fallbackText={lesson.materialsText} emptyLabel="No materials yet." className="space-y-3 text-base leading-8 text-muted-foreground" />
              </section>
            ) : null}

            <div className="flex flex-col gap-5 border-t border-border pt-6">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SmallCaps className="tabular-nums">{nodeProgress?.timeSpentSec ?? 0}s tracked</SmallCaps>
                {lesson.node.requireVideoWatch ? (
                  <>
                    <span className="text-muted-foreground/60" aria-hidden="true">
                      ·
                    </span>
                    <SmallCaps className="tabular-nums">{Math.round((nodeProgress?.videoWatchedFraction ?? 0) * 100)}% watched</SmallCaps>
                  </>
                ) : null}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {previousLesson ? (
                  <LinkButton to={hrefs.lesson(previousLesson._id)} variant="ghost" className="h-10 px-5">
                    Previous lesson
                  </LinkButton>
                ) : null}

                {nodeProgress?.completed ? (
                  <Button variant="ghost" className="h-10 px-5" onClick={() => void actions.markIncomplete()}>
                    Mark incomplete
                  </Button>
                ) : lesson.node.showMarkComplete === false ? null : (
                  <Button variant="primary" className="h-10 px-5" disabled={!completion.canComplete} onClick={() => void actions.markComplete()} title={completion.canComplete ? undefined : completion.requirements.join(" ")}>
                    Mark complete
                  </Button>
                )}

                {nextLesson ? (
                  <LinkButton to={hrefs.lesson(nextLesson._id)} variant="ghost" className="h-10 px-5">
                    Next lesson
                  </LinkButton>
                ) : null}
              </div>

              {!nodeProgress?.completed && lesson.node.showMarkComplete !== false && completion.requirements.length > 0 ? <Notice>{completion.requirements.join(" ")}</Notice> : null}
            </div>
          </article>
        )}

        {showComplete ? (
          <section className="flex flex-col gap-5 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-xl leading-snug tracking-tight text-foreground">{course.certificateId ? "Certificate" : "Course complete"}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {course.certificateId ? (certificate ? `Issued ${formatIssuedDate(certificate.issuedAt)}` : "Your course is complete. Issue your certificate.") : "Your course is complete. Continue with the next step."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {completionRedirectUrl ? (
                <a href={completionRedirectUrl} className={buttonClasses("primary", "h-10 px-5")}>
                  Continue
                </a>
              ) : null}
              {course.certificateId ? (
                certificate ? (
                  <>
                    {certificate.pdfUrl ? (
                      <a href={certificate.pdfUrl} target="_blank" rel="noreferrer" className={buttonClasses("primary", "h-10 px-5")}>
                        Download PDF
                      </a>
                    ) : null}
                    <LinkButton to={hrefs.certificate(certificate.serial)} variant="ghost" className="h-10 px-5">
                      View certificate
                    </LinkButton>
                  </>
                ) : (
                  <Button variant="primary" className="h-10 px-5" onClick={() => void actions.issueCertificate()}>
                    Issue certificate
                  </Button>
                )
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14" role="status" aria-label="Loading">
      <div className="flex flex-col gap-4" aria-hidden="true">
        <SkeletonBlock className="h-3 w-20 rounded-full" />
        <SkeletonBlock className="h-6 w-3/4" />
        <SkeletonBlock className="h-1 w-full rounded-full" />
        <SkeletonText lines={5} />
      </div>
      <div className="flex flex-col gap-6" aria-hidden="true">
        <SkeletonBlock className="h-3 w-16 rounded-full" />
        <SkeletonBlock className="h-10 w-2/3" />
        <SkeletonBlock className="aspect-video w-full rounded-2xl" />
        <SkeletonText lines={6} />
      </div>
    </div>
  );
}

function VideoEmbed({ url }: { url: string }) {
  const safeUrl = safeVideoUrl(url);
  if (!safeUrl) return null;
  const src = getVideoEmbedUrl(safeUrl);

  if (src) {
    return (
      <div className="overflow-hidden rounded-2xl bg-muted">
        <iframe title="Lesson video" className="aspect-video w-full" src={src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  return (
    <a href={safeUrl} target="_blank" rel="noreferrer" className="self-start text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] hover:decoration-foreground">
      Open lesson video
    </a>
  );
}
