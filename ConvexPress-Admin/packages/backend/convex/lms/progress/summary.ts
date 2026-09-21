type Node = { _id: string; courseId: string; kind: string; parentId?: string; position: number; title: string };
type Progress = { userId: string; courseId: string; nodeId: string; completed: boolean };

/** Display rounding must never turn unfinished work into completion authority. */
export function completionPercent(completed: number, total: number): number {
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || completed < 0 || total < completed)
    throw new RangeError("Invalid lesson completion counts");
  if (total === 0) return 0;
  return completed === total ? 100 : Math.min(99, Math.round(completed / total * 100));
}

/** Queries and completion writes count the same unique, still-existing lessons.
 * Old root lessons remain countable; deleted, foreign-course and foreign-viewer
 * rows do not. A duplicate import cannot award extra completion credit. */
export function summarizeCourseProgress(courseId: string, userId: string, sourceNodes: readonly Node[], rows: readonly Progress[]) {
  const nodes = sourceNodes.filter(node => node.courseId === courseId);
  const order = (a: Node, b: Node) => a.position - b.position || a._id.localeCompare(b._id);
  const topics = nodes.filter(node => node.kind === "topic").sort(order);
  const topicIds = new Set(topics.map(topic => topic._id));
  const lessons = nodes.filter(node => node.kind === "lesson");
  const groups = new Map<string | undefined, Node[]>();
  for (const lesson of lessons) {
    const parent = lesson.parentId && topicIds.has(lesson.parentId) ? lesson.parentId : undefined;
    const group = groups.get(parent) ?? [];
    group.push(lesson); groups.set(parent, group);
  }
  for (const group of groups.values()) group.sort(order);
  const ordered = topics.flatMap(topic => groups.get(topic._id) ?? []);
  ordered.push(...(groups.get(undefined) ?? []));
  const completed = new Set(rows.filter(row => row.userId === userId && row.courseId === courseId && row.completed).map(row => row.nodeId));
  const completedNodeIds = ordered.filter(lesson => completed.has(lesson._id)).map(lesson => lesson._id);
  const total = ordered.length, completedCount = completedNodeIds.length;
  return {
    percent: completionPercent(completedCount, total), total, completedCount, completedNodeIds,
    nextNodeId: ordered.find(lesson => !completed.has(lesson._id))?._id ?? null,
    topicProgress: topics.map(topic => {
      const children = groups.get(topic._id) ?? [];
      const count = children.filter(lesson => completed.has(lesson._id)).length;
      return { topicId: topic._id, title: topic.title, percent: completionPercent(count, children.length), completedCount: count, total: children.length };
    }),
  };
}
