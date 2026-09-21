import { lazy, Suspense } from "react";
import { useCan } from "@/hooks/useCan";
import { useTemplateCustomizer } from "./useTemplateSettings";

const CustomizerPanel = lazy(() => import("./CustomizerPanel"));

/** Visitors never download the editor panel. Authority and an explicit open
 * request are checked before React invokes its loader. */
export function OnSiteCustomizer() {
  const allowed = useCan("manage_options");
  const controller = useTemplateCustomizer();
  if (!allowed || !controller.open) return null;
  return <Suspense fallback={null}><CustomizerPanel /></Suspense>;
}
