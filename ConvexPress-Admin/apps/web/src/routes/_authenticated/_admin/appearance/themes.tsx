import { createFileRoute } from "@tanstack/react-router";
import { ThemeGallery } from "@/components/themes/ThemeGallery";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/themes",
)({
  component: ThemesPage,
});

function ThemesPage() {
  return <ThemeGallery />;
}
