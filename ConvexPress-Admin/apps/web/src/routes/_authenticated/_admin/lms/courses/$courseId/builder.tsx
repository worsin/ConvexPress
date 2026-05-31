/**
 * Curriculum Builder — /lms/courses/$courseId/builder
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Layers,
  FileText,
  Type,
  PlayCircle,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/builder",
)({
  component: BuilderPage,
});

type NodeMut = (args: { nodeId: Id<"lms_nodes"> }) => Promise<unknown>;

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
    | {
        topics: Array<{
          _id: Id<"lms_nodes">;
          title: string;
          children: Array<{ _id: Id<"lms_nodes">; kind: string; title: string }>;
        }>;
      }
    | undefined;

  const createNode = useMutation(api.lms.nodes.mutations.createNode);
  const renameNode = useMutation(api.lms.nodes.mutations.renameNode);
  const deleteNode = useMutation(api.lms.nodes.mutations.deleteNode);
  const moveNode = useMutation(api.lms.nodes.mutations.moveNode);

  const [newTopic, setNewTopic] = useState("");

  async function addTopic() {
    if (!newTopic.trim()) return;
    await run("Topic added", () =>
      createNode({ courseId: id, kind: "topic", title: newTopic.trim() }),
    );
    setNewTopic("");
  }

  const topics = tree?.topics ?? [];

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
          <p className="text-sm text-muted-foreground">
            {course?.title ?? "Loading…"}
          </p>
        </div>
      </div>

      {tree === undefined ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-4">
          {topics.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No topics yet. Add your first topic below to start building the
              curriculum.
            </div>
          )}

          {topics.map((topic, i) => (
            <TopicBlock
              key={topic._id}
              courseId={courseId}
              topic={topic}
              isFirst={i === 0}
              isLast={i === topics.length - 1}
              createNode={createNode}
              renameNode={renameNode}
              deleteNode={deleteNode}
              moveNode={moveNode}
            />
          ))}

          {/* Add topic */}
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
      )}
    </div>
  );
}

function TopicBlock({
  courseId,
  topic,
  isFirst,
  isLast,
  createNode,
  renameNode,
  deleteNode,
  moveNode,
}: {
  courseId: string;
  topic: {
    _id: Id<"lms_nodes">;
    title: string;
    children: Array<{
      _id: Id<"lms_nodes">;
      kind: string;
      title: string;
    }>;
  };
  isFirst: boolean;
  isLast: boolean;
  createNode: (args: {
    courseId: Id<"lms_courses">;
    parentId?: Id<"lms_nodes">;
    kind: "topic" | "lesson" | "section_heading";
    title: string;
  }) => Promise<unknown>;
  renameNode: (args: { nodeId: Id<"lms_nodes">; title: string }) => Promise<unknown>;
  deleteNode: NodeMut;
  moveNode: (args: {
    nodeId: Id<"lms_nodes">;
    direction: "up" | "down";
  }) => Promise<unknown>;
}) {
  const [newLesson, setNewLesson] = useState("");

  function rename(nodeId: Id<"lms_nodes">, current: string) {
    const title = window.prompt("Rename", current);
    if (title && title.trim() && title !== current) {
      void run("Renamed", () => renameNode({ nodeId, title: title.trim() }));
    }
  }

  async function addLesson(kind: "lesson" | "section_heading") {
    const title =
      kind === "lesson" ? newLesson.trim() : window.prompt("Section heading") ?? "";
    if (!title.trim()) return;
    await run(kind === "lesson" ? "Lesson added" : "Heading added", () =>
      createNode({
        courseId: courseId as Id<"lms_courses">,
        parentId: topic._id,
        kind,
        title: title.trim(),
      }),
    );
    if (kind === "lesson") setNewLesson("");
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Link
          to="/lms/courses/$courseId/topics/$nodeId"
          params={{ courseId, nodeId: topic._id }}
          className="flex-1 font-medium hover:underline"
        >
          {topic.title}
        </Link>
        <IconBtn title="Move up" disabled={isFirst} onClick={() => void run("", () => moveNode({ nodeId: topic._id, direction: "up" }))}>
          <ChevronUp className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Move down" disabled={isLast} onClick={() => void run("", () => moveNode({ nodeId: topic._id, direction: "down" }))}>
          <ChevronDown className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Rename" onClick={() => rename(topic._id, topic.title)}>
          <Pencil className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Delete topic" danger onClick={() => {
          if (window.confirm(`Delete topic "${topic.title}" and its lessons?`))
            void run("Deleted", () => deleteNode({ nodeId: topic._id }));
        }}>
          <Trash2 className="h-4 w-4" />
        </IconBtn>
      </div>

      <div className="divide-y divide-border">
        {topic.children.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground">No lessons yet.</div>
        )}
        {topic.children.map((child, ci) => (
          <div key={child._id} className="flex items-center gap-2 px-4 py-2">
            {child.kind === "section_heading" ? (
              <Type className="h-4 w-4 text-muted-foreground" />
            ) : child.kind === "lesson" ? (
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
            {child.kind === "lesson" ? (
              <Link
                to="/lms/courses/$courseId/lessons/$nodeId"
                params={{ courseId, nodeId: child._id }}
                className="flex-1 text-sm hover:underline"
              >
                {child.title}
              </Link>
            ) : (
              <span className="flex-1 text-sm font-medium uppercase text-muted-foreground">
                {child.title}
              </span>
            )}
            <IconBtn title="Move up" disabled={ci === 0} onClick={() => void run("", () => moveNode({ nodeId: child._id, direction: "up" }))}>
              <ChevronUp className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Move down" disabled={ci === topic.children.length - 1} onClick={() => void run("", () => moveNode({ nodeId: child._id, direction: "down" }))}>
              <ChevronDown className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Rename" onClick={() => rename(child._id, child.title)}>
              <Pencil className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Delete" danger onClick={() => {
              if (window.confirm(`Delete "${child.title}"?`))
                void run("Deleted", () => deleteNode({ nodeId: child._id }));
            }}>
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          </div>
        ))}
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
        <button
          type="button"
          onClick={() => void addLesson("lesson")}
          className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
        >
          Add Lesson
        </button>
        <button
          type="button"
          onClick={() => void addLesson("section_heading")}
          className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
        >
          Add Heading
        </button>
      </div>
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
