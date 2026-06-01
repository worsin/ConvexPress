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
import { useAuth } from "@/lib/auth-context";
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
  Check,
  X,
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
  const { can } = useAuth();
  const { courseId } = Route.useParams();
  const id = courseId as Id<"lms_courses">;
  const canViewCourses = can("lms.course.view");
  const canManageBuilder = can("lms.builder.manage");
  const canEditLessons = can("lms.lesson.edit");
  const canGenerateAi = can("lms.ai.generate");
  const canOpenBuilder = canViewCourses || canManageBuilder || canEditLessons;
  const course = useQuery(
    api.lms.courses.queries.getById,
    canOpenBuilder ? { courseId: id } : "skip",
  );
  const tree = useQuery(
    api.lms.nodes.queries.getCourseTree,
    canOpenBuilder ? { courseId: id } : "skip",
  ) as
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

  if (!canOpenBuilder) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this course builder.
        </p>
        <Link to="/lms" className="text-sm text-primary hover:underline">
          Back to LMS
        </Link>
      </div>
    );
  }

  async function addTopic() {
    if (!canManageBuilder) {
      toast.error("You do not have permission to manage the curriculum.");
      return;
    }
    if (!newTopic.trim()) return;
    await run("Topic added", () =>
      createNode({ courseId: id, kind: "topic", title: newTopic.trim() }),
    );
    setNewTopic("");
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canManageBuilder) return;
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
                  No topics yet.
                </p>
                {canGenerateAi ? (
                  <Link
                    to="/lms/courses/$courseId/generate"
                    params={{ courseId }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Sparkles className="h-4 w-4" /> Generate with AI
                  </Link>
                ) : null}
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
                  canManageBuilder={canManageBuilder}
                  canEditLessons={canEditLessons}
                />
              ))}
            </SortableContext>

            {canManageBuilder ? (
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
            ) : null}
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
  canManageBuilder,
  canEditLessons,
}: {
  courseId: string;
  topic: Topic;
  isFirst: boolean;
  isLast: boolean;
  canManageBuilder: boolean;
  canEditLessons: boolean;
}) {
  const createNode = useMutation(api.lms.nodes.mutations.createNode);
  const renameNode = useMutation(api.lms.nodes.mutations.renameNode);
  const deleteNode = useMutation(api.lms.nodes.mutations.deleteNode);
  const moveNode = useMutation(api.lms.nodes.mutations.moveNode);
  const [newLesson, setNewLesson] = useState("");
  const [newHeading, setNewHeading] = useState("");
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState(topic.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: topic._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  function startTopicRename() {
    if (!canManageBuilder) return;
    setTopicDraft(topic.title);
    setEditingTopic(true);
  }

  async function saveTopicRename() {
    const title = topicDraft.trim();
    if (!canManageBuilder || !title || title === topic.title) {
      setEditingTopic(false);
      setTopicDraft(topic.title);
      return;
    }
    await run("Renamed", () =>
      renameNode({ nodeId: topic._id as Id<"lms_nodes">, title }),
    );
    setEditingTopic(false);
  }

  async function addLesson(kind: "lesson" | "section_heading") {
    if (!canManageBuilder) {
      toast.error("You do not have permission to manage the curriculum.");
      return;
    }
    const title = kind === "lesson" ? newLesson.trim() : newHeading.trim();
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
    if (kind === "section_heading") setNewHeading("");
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        {canManageBuilder ? (
          <button
            type="button"
            className="cursor-grab text-muted-foreground"
            {...attributes}
            {...listeners}
            title="Drag to reorder"
            aria-label={`Drag ${topic.title} to reorder`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
        <Layers className="h-4 w-4 text-muted-foreground" />
        {editingTopic ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTopicRename();
            }}
          >
            <input
              value={topicDraft}
              onChange={(event) => setTopicDraft(event.target.value)}
              aria-label="Topic title"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <IconBtn title="Save topic title" onClick={() => void saveTopicRename()}>
              <Check className="h-4 w-4" />
            </IconBtn>
            <IconBtn
              title="Cancel topic rename"
              onClick={() => {
                setEditingTopic(false);
                setTopicDraft(topic.title);
              }}
            >
              <X className="h-4 w-4" />
            </IconBtn>
          </form>
        ) : canManageBuilder ? (
          <Link
            to="/lms/courses/$courseId/topics/$nodeId"
            params={{ courseId, nodeId: topic._id }}
            className="flex-1 font-medium hover:underline"
          >
            {topic.title}
          </Link>
        ) : (
          <span className="flex-1 font-medium">{topic.title}</span>
        )}
        {canManageBuilder ? (
          <>
            <IconBtn title="Move up" disabled={isFirst} onClick={() => void run("", () => moveNode({ nodeId: topic._id as Id<"lms_nodes">, direction: "up" }))}>
              <ChevronUp className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Move down" disabled={isLast} onClick={() => void run("", () => moveNode({ nodeId: topic._id as Id<"lms_nodes">, direction: "down" }))}>
              <ChevronDown className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Rename" onClick={startTopicRename}>
              <Pencil className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Delete topic" danger onClick={() => {
              if (window.confirm(`Delete topic "${topic.title}" and its lessons?`))
                void run("Deleted", () => deleteNode({ nodeId: topic._id as Id<"lms_nodes"> }));
            }}>
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          </>
        ) : null}
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
              canManageBuilder={canManageBuilder}
              canEditLessons={canEditLessons}
            />
          ))}
        </SortableContext>
      </div>

      {canManageBuilder ? (
        <div className="grid gap-2 px-4 py-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <input
              value={newLesson}
              onChange={(e) => setNewLesson(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addLesson("lesson");
              }}
              placeholder="New lesson title..."
              aria-label="New lesson title"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button type="button" onClick={() => void addLesson("lesson")} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
              Add
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <Type className="h-4 w-4 text-muted-foreground" />
            <input
              value={newHeading}
              onChange={(e) => setNewHeading(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addLesson("section_heading");
              }}
              placeholder="New heading title..."
              aria-label="New section heading title"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button type="button" onClick={() => void addLesson("section_heading")} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChildRow({
  courseId,
  child,
  isFirst,
  isLast,
  renameNode,
  moveNode,
  deleteNode,
  canManageBuilder,
  canEditLessons,
}: {
  courseId: string;
  child: Child;
  isFirst: boolean;
  isLast: boolean;
  renameNode: (a: { nodeId: Id<"lms_nodes">; title: string }) => Promise<unknown>;
  deleteNode: (a: { nodeId: Id<"lms_nodes"> }) => Promise<unknown>;
  moveNode: (a: { nodeId: Id<"lms_nodes">; direction: "up" | "down" }) => Promise<unknown>;
  canManageBuilder: boolean;
  canEditLessons: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: child._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(child.title);

  function startRename() {
    if (!canManageBuilder) return;
    setDraftTitle(child.title);
    setEditing(true);
  }

  async function saveRename() {
    const title = draftTitle.trim();
    if (!canManageBuilder || !title || title === child.title) {
      setEditing(false);
      setDraftTitle(child.title);
      return;
    }
    await run("Renamed", () =>
      renameNode({ nodeId: child._id as Id<"lms_nodes">, title }),
    );
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-4 py-2">
      {canManageBuilder ? (
        <button
          type="button"
          className="cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          aria-label={`Drag ${child.title} to reorder`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      {child.kind === "section_heading" ? (
        <Type className="h-4 w-4 text-muted-foreground" />
      ) : (
        <PlayCircle className="h-4 w-4 text-muted-foreground" />
      )}
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveRename();
          }}
        >
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            aria-label={`${child.kind === "lesson" ? "Lesson" : "Heading"} title`}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <IconBtn title="Save title" onClick={() => void saveRename()}>
            <Check className="h-4 w-4" />
          </IconBtn>
          <IconBtn
            title="Cancel rename"
            onClick={() => {
              setEditing(false);
              setDraftTitle(child.title);
            }}
          >
            <X className="h-4 w-4" />
          </IconBtn>
        </form>
      ) : child.kind === "lesson" && canEditLessons ? (
        <Link to="/lms/courses/$courseId/lessons/$nodeId" params={{ courseId, nodeId: child._id }} className="flex-1 text-sm hover:underline">
          {child.title}
        </Link>
      ) : (
        <span className="flex-1 text-sm font-medium uppercase text-muted-foreground">{child.title}</span>
      )}
      {canManageBuilder ? (
        <>
          <IconBtn title="Move up" disabled={isFirst} onClick={() => void run("", () => moveNode({ nodeId: child._id as Id<"lms_nodes">, direction: "up" }))}>
            <ChevronUp className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Move down" disabled={isLast} onClick={() => void run("", () => moveNode({ nodeId: child._id as Id<"lms_nodes">, direction: "down" }))}>
            <ChevronDown className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Rename" onClick={startRename}>
            <Pencil className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Delete" danger onClick={() => {
            if (window.confirm(`Delete "${child.title}"?`))
              void run("Deleted", () => deleteNode({ nodeId: child._id as Id<"lms_nodes"> }));
          }}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </>
      ) : null}
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
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 ${
        danger ? "hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
