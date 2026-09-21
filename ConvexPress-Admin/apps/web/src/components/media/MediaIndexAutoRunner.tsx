import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  runMediaIndexMaintenance,
  type MediaIndexProgress,
} from "@convexpress/runtime-clients/media-index-maintenance";
export function MediaIndexAutoRunner({
  ports,
  current,
  link,
}: {
  ports: {
    read(): Promise<unknown>;
    begin(): Promise<unknown>;
    step(args: { generation: string; expectedSequence: number }): Promise<unknown>;
  };
  current: MediaIndexProgress | undefined;
  link: ReactNode;
}) {
  const [failure, setFailure] = useState(false);
  const [observed, setObserved] = useState<MediaIndexProgress>();
  const latest = useRef(current);
  latest.current = current;
  const generation = current?.generation;
  useEffect(() => {
    let active = true;
    setFailure(false);
    setObserved(undefined);
    if (!generation || !latest.current || !["stale", "building"].includes(latest.current.status))
      return;
    void (async () => {
      try {
        for (let batch = 0; batch < 200 && active; batch++) {
          const progress = await runMediaIndexMaintenance({
            ...ports,
            active: () => active,
            onProgress: (value) => {
              if (active) setObserved(value);
            },
          });
          if (!active || progress.status !== "building") return;
        }
        if (active) setFailure(true);
      } catch {
        if (active) setFailure(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [ports, generation]);
  const progress =
    observed &&
    observed.generation === generation &&
    (!current || observed.sequence > current.sequence)
      ? observed
      : current;
  if (!progress || progress.status === "ready") return null;
  return (
    <div
      className="mb-3 rounded border border-border bg-card p-3 text-sm"
      role={failure || progress.status === "blocked" ? "alert" : "status"}
    >
      <p>
        {failure || progress.status === "blocked"
          ? "Media indexing paused safely. Open Media deletion safety to inspect and resume."
          : progress.status === "unconfigured"
            ? "Update this site's backend to enable automatic media indexing."
            : `Preparing media deletion safety: ${progress.completedOwners} of ${progress.totalOwners} content groups checked. You can continue editing.`}
      </p>
      {link}
    </div>
  );
}
