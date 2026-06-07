import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/recipes")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "recipes");
  },
  component: RecipesLayout,
});

function RecipesLayout() {
  return (
    <PublicPluginGate pluginId="recipes">
      <Outlet />
    </PublicPluginGate>
  );
}
