import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useConvex, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { MediaIndexAutoRunner } from "./MediaIndexAutoRunner";
import { MediaReadBoundary } from "./MediaPagination";

/** First authorized sign-in, backend upgrade and restored-generation continuation.
 * No deployment credential, epoch write or privileged bootstrap identity enters UI. */
export function MediaIndexAutoMaintenance() {
  const { user, can } = useAuth();
  const client = useConvex();
  if (!user || !can("manage_options")) return null;
  return (
    <MediaReadBoundary key={`${client.url}:${user._id}`}>
      <Controller />
    </MediaReadBoundary>
  );
}
function Controller() {
  const client = useConvex();
  const current = useQuery(api.media.reverseBackfill.status, {});
  const ports = useMemo(
    () => ({
      read: () => client.query(api.media.reverseBackfill.status, {}),
      begin: () => client.mutation(api.media.reverseBackfill.begin, {}),
      step: (args: { generation: string; expectedSequence: number }) =>
        client.mutation(api.media.reverseBackfill.step, args),
    }),
    [client],
  );
  return (
    <MediaIndexAutoRunner
      ports={ports}
      current={current}
      link={
        <Link to="/media" className="mt-1 inline-block underline">
          Open Media deletion safety
        </Link>
      }
    />
  );
}
