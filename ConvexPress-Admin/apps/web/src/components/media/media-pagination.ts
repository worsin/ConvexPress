export type MediaPageStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
export type MediaCountDocument = { _id: string; mediaType: string; trashed: boolean; mine: boolean; unattached: boolean };

export function uniqueMedia<T extends { _id: string }>(rows: readonly T[]): T[] {
  return [...new Map(rows.map((row) => [row._id, row])).values()];
}

export function summarizeMediaCounts(rows: readonly MediaCountDocument[], status: MediaPageStatus) {
  const unique = uniqueMedia(rows);
  const counts = { all: 0, images: 0, audio: 0, video: 0, documents: 0, mine: 0, unattached: 0, trashed: 0 };
  for (const row of unique) {
    if (row.trashed) { counts.trashed++; continue; }
    counts.all++;
    if (row.mediaType === "image") counts.images++;
    if (row.mediaType === "audio") counts.audio++;
    if (row.mediaType === "video") counts.video++;
    if (row.mediaType === "document") counts.documents++;
    if (row.mine) counts.mine++;
    if (row.unattached) counts.unattached++;
  }
  return { counts, counted: unique.length, complete: status === "Exhausted" };
}

export function mediaProgressText(count: number, status: MediaPageStatus, counting = false) {
  if (status === "LoadingFirstPage") return counting ? "Loading library counts…" : "Loading media…";
  if (counting) return status === "Exhausted" ? `Library counts complete · ${count} records counted` : `${count} records counted · totals incomplete`;
  if (status === "Exhausted") return count === 0 ? "No matching media found." : `${count} matching media items loaded · complete`;
  return count === 0 ? "No matches in the loaded pages. More media remains to check." : `${count} matching media items loaded · more available`;
}
