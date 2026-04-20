import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { Button } from "@/components/ui/button";

export function GallerySettingsPanel() {
  const { values, isEnabled } = usePluginSettings();
  const updateSection = useMutation(api.settings.mutations.updateSection);

  const enabled = isEnabled("gallery");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Gallery Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control public availability for gallery routes, embeds, and album
          pages. Core display settings live on each album so editors can tune
          layout per gallery.
        </p>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">
              Public gallery system
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              When disabled, website routes and shortcode embeds stop rendering.
            </p>
          </div>
          <Button
            variant={enabled ? "outline" : "default"}
            onClick={() =>
              void updateSection({
                section: "plugins",
                values: {
                  ...values,
                  galleryEnabled: !enabled,
                },
              })
                .then(() =>
                  toast.success(
                    enabled
                      ? "Gallery extension disabled."
                      : "Gallery extension enabled.",
                  ),
                )
                .catch((error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to update gallery settings",
                  ),
                )
            }
          >
            {enabled ? "Disable Gallery" : "Enable Gallery"}
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="text-lg font-medium text-foreground">Embed contract</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Supported shortcode formats:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-muted/50 p-4 text-xs text-foreground">
{`[album slug="summer-trip"]
[album id="..."]
[album slug="summer-trip" layout="masonry" columns="3" show_title="true"]`}
        </pre>
      </section>
    </div>
  );
}
