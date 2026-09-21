import { lazy, Suspense, useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { useCan } from "@/hooks/useCan";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getSiteRuntime } from "@/lib/site-runtime";
import { useTemplateCustomizer } from "./useTemplateSettings";
import { EMPTY_PREVIEW } from "./customizeContext";

const CustomizerPanel = lazy(() => import("./CustomizerPanel"));

/** Visitors never download the editor panel. Authority and an explicit open
 * request are checked before React invokes its loader. */
export function OnSiteCustomizer() {
  const { isAuthenticated } = useConvexAuth();
  const allowed = useCan("manage_options");
  const { user } = useCurrentUser();
  const controller = useTemplateCustomizer();
  useEffect(() => {
    if (!isAuthenticated || !allowed) controller.setDraft(EMPTY_PREVIEW);
  }, [isAuthenticated, allowed, controller.setDraft]);
  // A cached profile/role from the preceding provider is not proof that the
  // newly selected operator token has been accepted by this backend.
  if (!isAuthenticated || !allowed || !user || !controller.open) return null;
  const runtime = getSiteRuntime();
  const owner = JSON.stringify([runtime.convexUrl, runtime.instanceKey, user._id]);
  return <Suspense fallback={null}><CustomizerPanel key={owner} recoveryOwner={owner} /></Suspense>;
}
