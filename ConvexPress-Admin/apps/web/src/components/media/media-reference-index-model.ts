export type MediaIndexProgress = {
  status: "unconfigured" | "stale" | "building" | "blocked" | "ready";
  generation: string | null; sequence: number; owner: string | null;
  completedOwners: number; totalOwners: number; pages: number; documents: number; errorCode?: string;
};
/** A user click owns a bounded batch. Scope changes/pause stop before the next mutation. */
export async function continueMediaIndex(input: {
  begin: () => Promise<MediaIndexProgress>;
  step: (args: { generation: string; expectedSequence: number }) => Promise<MediaIndexProgress>;
  active: () => boolean;
  onProgress: (value: MediaIndexProgress) => void;
}): Promise<void> {
  if (!input.active()) return;
  let progress = await input.begin();
  if (!input.active()) return;
  input.onProgress(progress);
  for (let page = 0; page < 25 && input.active() && (progress.status === "building" || progress.status === "blocked"); page++) {
    if (!progress.generation) throw new Error("Missing index generation");
    progress = await input.step({ generation: progress.generation, expectedSequence: progress.sequence });
    if (!input.active()) return;
    input.onProgress(progress);
    // A refused page needs an explicit repair/retry, never an automatic loop.
    if (progress.status === "blocked") return;
  }
}
