export const MEDIA_INDEX_EPOCH_NAME = "MEDIA_REFERENCE_INDEX_EPOCH";
export type MediaIndexProgress = {
  status: "unconfigured" | "stale" | "building" | "blocked" | "ready";
  generation: string | null;
  sequence: number;
  owner: string | null;
  completedOwners: number;
  totalOwners: number;
  pages: number;
  documents: number;
  errorCode?: string;
};
export function parseMediaIndexProgress(input: unknown): MediaIndexProgress {
  if (!input || typeof input !== "object") throw Error("Invalid media index progress.");
  const value = input as Record<string, unknown>;
  if (
    !["unconfigured", "stale", "building", "blocked", "ready"].includes(String(value.status)) ||
    !(
      value.generation === null ||
      (typeof value.generation === "string" && value.generation.length <= 300)
    ) ||
    !(value.owner === null || (typeof value.owner === "string" && value.owner.length <= 100)) ||
    ["sequence", "completedOwners", "totalOwners", "pages", "documents"].some(
      (key) => !Number.isSafeInteger(value[key]) || Number(value[key]) < 0,
    ) ||
    Number(value.completedOwners) > Number(value.totalOwners) ||
    !(
      value.errorCode === undefined ||
      (typeof value.errorCode === "string" && value.errorCode.length <= 200)
    ) ||
    (value.status === "ready" &&
      (!value.generation ||
        value.owner !== null ||
        value.totalOwners === 0 ||
        value.completedOwners !== value.totalOwners))
  )
    throw Error("Invalid media index progress.");
  return {
    status: value.status as MediaIndexProgress["status"],
    generation: value.generation as string | null,
    owner: value.owner as string | null,
    sequence: Number(value.sequence),
    completedOwners: Number(value.completedOwners),
    totalOwners: Number(value.totalOwners),
    pages: Number(value.pages),
    documents: Number(value.documents),
    ...(value.errorCode ? { errorCode: String(value.errorCode) } : {}),
  };
}
/** One batch is bounded to 25 pages. Callers control lifetime and persist every
 * returned state. Backend progress remains authoritative after lost responses. */
export async function runMediaIndexMaintenance(io: {
  read(): Promise<unknown>;
  begin(): Promise<unknown>;
  step(args: { generation: string; expectedSequence: number }): Promise<unknown>;
  active(): boolean;
  onProgress(progress: MediaIndexProgress): void | Promise<void>;
}): Promise<MediaIndexProgress> {
  let progress = parseMediaIndexProgress(await io.read());
  if (!io.active()) return progress;
  await io.onProgress(progress);
  if (["ready", "blocked", "unconfigured"].includes(progress.status)) return progress;
  if (!io.active()) return progress;
  const generation = progress.generation;
  if (!generation) throw Error("Missing media index generation.");
  progress = parseMediaIndexProgress(await io.begin());
  if (!io.active()) return progress;
  if (progress.generation !== generation)
    throw Error("Media index generation changed; resume against fresh progress.");
  await io.onProgress(progress);
  for (let page = 0; page < 25 && progress.status === "building" && io.active(); page++) {
    const next = parseMediaIndexProgress(
      await io.step({ generation, expectedSequence: progress.sequence }),
    );
    if (!io.active()) return next;
    if (
      next.generation !== generation ||
      next.status === "stale" ||
      next.status === "unconfigured" ||
      next.sequence <= progress.sequence
    )
      throw Error("Media index generation or cursor changed; refresh before continuing.");
    progress = next;
    await io.onProgress(progress);
  }
  if (progress.status === "ready" && io.active()) {
    const checked = parseMediaIndexProgress(await io.read());
    if (checked.status !== "ready" || checked.generation !== generation)
      throw Error("Media index readiness changed during verification.");
    progress = checked;
    await io.onProgress(progress);
  }
  return progress;
}
