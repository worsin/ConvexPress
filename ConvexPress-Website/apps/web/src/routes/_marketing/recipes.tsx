import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/recipes")({
  component: RecipesLayout,
});

function RecipesLayout() {
  return (
    <PublicPluginGate pluginId="recipes">
      <Outlet />
    </PublicPluginGate>
  );
}
