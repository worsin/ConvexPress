export type SearchKind = "post" | "page" | "media" | "comment" | "course" | "product" | "event";
export interface ReindexProgress {
  needsRestart: boolean;
  contentType: SearchKind | null;
  jobId: string;
  status: "running" | "completed" | "failed";
  sequence: number;
  indexed: Record<SearchKind, number>;
  processed: number;
  removed: number;
  errors: number;
  failedAttempts: number;
  failure?: { contentType: SearchKind; contentId: string };
  duration: number;
}
export async function continueReindex(options: {
  initial?: ReindexProgress | null;
  run: (args: { jobId?: string; contentType?: SearchKind }) => Promise<ReindexProgress>;
  active: () => boolean;
  onProgress: (state: ReindexProgress) => void;
}) {
  let state = options.initial?.status !== "completed" && !options.initial?.needsRestart ? options.initial : null;
  const restartScope = options.initial?.needsRestart ? options.initial.contentType : null;
  while (options.active()) {
    const next = await options.run({ ...(state ? { jobId: state.jobId, ...(state.contentType ? { contentType: state.contentType } : {}) } : restartScope ? { contentType: restartScope } : {}) });
    if (!options.active()) return;
    options.onProgress(next);
    if (next.status !== "running") return next;
    state = next;
  }
}
export function indexedTotal(progress: ReindexProgress) { return Object.values(progress.indexed).reduce((sum, count) => sum + count, 0); }
