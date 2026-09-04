import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";
import { buildIndexablePageHead, siteTitled } from "@/lib/seo/head";
import { useSettings } from "@/contexts/SettingsContext";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import CoreSupportHome, { type SupportHomeSurfaceData } from "@/templates/packs/core/surfaces/support.home";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/support/")({
  loader: () => ({
    seoHead: buildIndexablePageHead({
      title: siteTitled("Support"),
      description: "Find help, search the knowledge base, or submit a support ticket.",
      path: "/support",
    }),
  }),
  component: SupportLandingPage,
  errorComponent: ErrorComponent,
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function SupportLandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const settings = useSettings();
  const knowledgeBaseEnabled = isPublicPluginEnabled("kb", settings);

  const data: SupportHomeSurfaceData = {
    isLoaded: !!isLoaded,
    isSignedIn: !!isSignedIn,
    knowledgeBaseEnabled,
  };

  return <Surface name="support.home" data={data} fallback={CoreSupportHome} />;
}
