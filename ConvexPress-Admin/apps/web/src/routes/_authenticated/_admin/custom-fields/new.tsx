/**
 * Add New Field Group
 * Route: /admin/custom-fields/new
 *
 * Creates a new field group with default settings and redirects to the editor.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/_admin/custom-fields/new",
)({
  component: NewFieldGroupPage,
});

function NewFieldGroupPage() {
  const navigate = useNavigate();
  const createGroup = useMutation(api.customFields.mutations.createGroup);
  const [isCreating, setIsCreating] = useState(true);
  // Guard against React Strict Mode double-fire (mount -> unmount -> remount)
  const hasCreatedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function create() {
      // Prevent duplicate creation from Strict Mode double-mount
      if (hasCreatedRef.current) return;
      hasCreatedRef.current = true;

      try {
        const groupId = await createGroup({
          title: "Untitled Field Group",
          locationRules: [
            [{ param: "post_type", operator: "==", value: "post" }],
          ],
        });

        if (!cancelled) {
          navigate({
            to: "/custom-fields/$groupId/edit",
            params: { groupId },
            replace: true,
          });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error("Failed to create field group");
          navigate({
            to: "/custom-fields",
            replace: true,
          });
        }
      }
    }

    create();

    return () => {
      cancelled = true;
    };
  }, [createGroup, navigate]);

  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}
