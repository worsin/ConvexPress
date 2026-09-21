/** A manual save may retire only an autosave pair already represented by the
 * previous or resulting saved body. Read and patch in the same transaction;
 * never erase distinct recovery content merely because another field was saved. */
type Saved = { title?: unknown; content?: unknown; autosaveTitle?: unknown; autosaveContent?: unknown; autosavedAt?: unknown };
type Clear = { autosaveTitle?: undefined; autosaveContent?: undefined; autosavedAt?: undefined };
export function reconcileManualSaveAutosave(previous: Saved, patch: Record<string, unknown>, supplied: { title?: unknown; content?: unknown }): Clear {
  if (supplied.title === undefined && supplied.content === undefined) return {};
  if (previous.autosaveTitle === undefined && previous.autosaveContent === undefined && previous.autosavedAt === undefined) return {};
  const matches = (saved: Saved) =>
    (previous.autosaveTitle === undefined || previous.autosaveTitle === saved.title) &&
    (previous.autosaveContent === undefined || previous.autosaveContent === (saved.content ?? ""));
  if (!matches(previous) && !matches({ ...previous, ...patch })) return {};
  return { autosaveTitle: undefined, autosaveContent: undefined, autosavedAt: undefined };
}
