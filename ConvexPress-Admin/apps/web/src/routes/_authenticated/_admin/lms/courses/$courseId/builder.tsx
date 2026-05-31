/**
 * Curriculum Builder — /lms/courses/$courseId/builder
 * Drag-and-drop (with up/down fallback) over the Course → Topic → Lesson tree.
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Layers,
  Type,
  PlayCircle,
  GripVertical,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/builder",
)({
  component: BuilderPage,
});

type Child = { _id: string; kind: string; title: string };
type Topic = { _id: string; title: string; children: Child[] };

async function run(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    if (label) toast.success(label);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Action failed");
  }
}

function BuilderPage() {
  const { courseId } = Route.useParams();
  const id = courseId as Id<"lms_courses">;
  const course = useQuery(api.lms.courses.queries.getById, { courseId: id });
  const tree = useQuery(api.lms.nodes.queries.getCourseTree, { courseId: id }) as
    | { topics: Topic[] }
    | undefined;

  const createNode = useMutation(api.lms.nodes.mutations.createNode);
  const reorderNodes = useMutation(api.lms.nodes.mutations.reorderNodes);

  const [newTopic, setNewTopic] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const topics = tree?.topics ?? [];

  async function addTopic() {
    if (!newTopic.trim()) return;
    await run("Topic added", () =>
      createNode({ courseId: id, kind: "topic", title: newTopic.trim() }),
    );
    setNewTopic("");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const topicIds = topics.map((t) => t._id);
    if (topicIds.includes(activeId)) {
      const oldI = topicIds.indexOf(activeId);
      const newI = topicIds.indexOf(overId);
      if (newI < 0) return;
      void reorderNodes({ orderedIds: arrayMove(topicIds, oldI, newI) as Id<"lms_nodes">[] });
      return;
    }
    const parent = topics.find((t) => t.children.some((c) => c._id === activeId));
    if (!parent) return;
    const childIds = parent.children.map((c) => c._id);
    const oldI = childIds.indexOf(activeId);
    const newI = childIds.indexOf(overId);
    if (newI < 0) return;
    void reorderNodes({ orderedIds: arrayMove(childIds, oldI, newI) as Id<"lms_nodes">[] });
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        to="/lms/courses/$courseId"
        params={{ courseId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <Layers className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-semibold">Curriculum Builder</h1>
          <p className="text-sm text-muted-foreground">{course?.title ?? "Loading…"}</p>
        </div>
      </div>

      {tree === undefined ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="space-y-4">
            {topics.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                  No topics yet. Add one below, or generate the whole course with AI.
                </p>
                <Link
                  to="/lms/courses/$courseId/generate"
                  params={{ courseId }}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Sparkles className="h-4 w-4" /> Generate with AI
                </Link>
              </div>
            )}

            <SortableContext items={topics.map((t) => t._id)} strategy={verticalListSortingStrategy}>
              {topics.map((topic, i) => (
                <TopicBlock
                  key={topic._id}
                  courseId={courseId}
                  topic={topic}
                  isFirst={i === 0}
                  isLast={i === topics.length - 1}
                />
              ))}
            </SortableContext>

            <div className="flex items-center gap-2 rounded-lg border border-border p-3">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addTopic();
                }}
                placeholder="New topic title…"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => void addTopic()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Add Topic
              </button>
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
}

function TopicBlock({
  courseId,
  topic,
  isFirst,
  isLast,
}: {
  courseId: string;
  topic: Topic;
  isFirst: boolean;
  isLast: boolean;
}) {
  const createNode = useMutation(api.lms.nodes.mutations.createNode);
  const renameNode = useMutation(api.lms.nodes.mutations.renameNode);
  const deleteNode = useMutation(api.lms.nodes.mutations.deleteNode);
  const moveNode = useMutation(api.lms.nodes.mutations.moveNode);
  const [newLesson, setNewLesson] = useState("");

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: topic._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  function rename(nodeId: string, current: string) {
    const title = window.prompt("Rename", current);
    if (title && title.trim() && title !== current) {
      void run("Renamed", () => renameNode({ nodeId: nodeId as Id<"lms_nodes">, title: title.trim() }));
    }
  }

  async function addLesson(kind: "lesson" | "section_heading") {
    const title = kind === "lesson" ? newLesson.trim() : window.prompt("Section heading") ?? "";
    if (!title.trim()) return;
    await run(kind === "lesson" ? "Lesson added" : "Heading added", () =>
      createNode({
        courseId: courseId as Id<"lms_courses">,
        parentId: topic._id as Id<"lms_nodes">,
        kind,
        title: title.trim(),
      }),
    );
    if (kind === "lesson") setNewLesson("");
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <button type="button" className="cursor-grab text-muted-foreground" {...attributes} {...listeners} title="Drag to reorder">
          <GripVertical className="h-4 w-4" />
        </button>
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Link
          to="/lms/courses/$courseId/topics/$nodeId"
          params={{ courseId, nodeId: topic._id }}
          className="flex-1 font-medium hover:underline"
        >
          {topic.title}
        </Link>
        <IconBtn title="Move up" disabled={isFirst} onClick={() => void run("", () => moveNode({ nodeId: topic._id as Id<"lms_nodes">, direction: "up" }))}>
          <ChevronUp className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Move down" disabled={isLast} onClick={() => void run("", () => moveNode({ nodeId: topic._id as Id<"lms_nodes">, direction: "down" }))}>
          <ChevronDown className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Rename" onClick={() => rename(topic._id, topic.title)}>
          <Pencil className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Delete topic" danger onClick={() => {
          if (window.confirm(`Delete topic "${topic.title}" and its lessons?`))
            void run("Deleted", () => deleteNode({ nodeId: topic._id as Id<"lms_nodes"> }));
        }}>
          <Trash2 className="h-4 w-4" />
        </IconBtn>
      </div>

      <div className="divide-y divide-border">
        {topic.children.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground">No lessons yet.</div>
        )}
        <SortableContext items={topic.children.map((c) => c._id)} strategy={verticalListSortingStrategy}>
          {topic.children.map((child, ci) => (
            <ChildRow
              key={child._id}
              courseId={courseId}
              child={child}
              isFirst={ci === 0}
              isLast={ci === topic.children.length - 1}
              renameNode={renameNode}
              deleteNode={deleteNode}
              moveNode={moveNode}
              rename={rename}
            />
          ))}
        </SortableContext>
      </div>

      <div className="flex items-center gap-2 px-4 py-2">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <input
          value={newLesson}
          onChange={(e) => setNewLesson(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addLesson("lesson");
          }}
          placeholder="New lesson title…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button type="button" onClick={() => void addLesson("lesson")} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
          Add Lesson
        </button>
        <button type="button" onClick={() => void addLesson("section_heading")} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
          Add Heading
        </button>
      </div>
    </div>
  );
}

function ChildRow({
  courseId,
  child,
  isFirst,
  isLast,
  moveNode,
  deleteNode,
  rename,
}: {
  courseId: string;
  child: Child;
  isFirst: boolean;
  isLast: boolean;
  renameNode: (a: { nodeId: Id<"lms_nodes">; title: string }) => Promise<unknown>;
  deleteNode: (a: { nodeId: Id<"lms_nodes"> }) => Promise<unknown>;
  moveNode: (a: { nodeId: Id<"lms_nodes">; direction: "up" | "down" }) => Promise<unknown>;
  rename: (nodeId: string, current: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: child._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-4 py-2">
      <button type="button" className="cursor-grab text-muted-foreground" {...attributes} {...listeners} title="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      {child.kind === "section_heading" ? (
        <Type className="h-4 w-4 text-muted-foreground" />
      ) : (
        <PlayCircle className="h-4 w-4 text-muted-foreground" />
      )}
      {child.kind === "lesson" ? (
        <Link to="/lms/courses/$courseId/lessons/$nodeId" params={{ courseId, nodeId: child._id }} className="flex-1 text-sm hover:underline">
          {child.title}
        </Link>
      ) : (
        <span className="flex-1 text-sm font-medium uppercase text-muted-foreground">{child.title}</span>
      )}
      <IconBtn title="Move up" disabled={isFirst} onClick={() => void run("", () => moveNode({ nodeId: child._id as Id<"lms_nodes">, direction: "up" }))}>
        <ChevronUp className="h-4 w-4" />
      </IconBtn>
      <IconBtn title="Move down" disabled={isLast} onClick={() => void run("", () => moveNode({ nodeId: child._id as Id<"lms_nodes">, direction: "down" }))}>
        <ChevronDown className="h-4 w-4" />
      </IconBtn>
      <IconBtn title="Rename" onClick={() => rename(child._id, child.title)}>
        <Pencil className="h-4 w-4" />
      </IconBtn>
      <IconBtn title="Delete" danger onClick={() => {
        if (window.confirm(`Delete "${child.title}"?`))
          void run("Deleted", () => deleteNode({ nodeId: child._id as Id<"lms_nodes"> }));
      }}>
        <Trash2 className="h-4 w-4" />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 ${
        danger ? "hover:text-red-600" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
