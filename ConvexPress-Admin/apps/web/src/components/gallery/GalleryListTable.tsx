import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function GalleryListTable() {
  const albums = useQuery(api.gallery.queries.list, {}) ?? [];
  const counts = useQuery(api.gallery.queries.counts, {});
  const trashAlbum = useMutation(api.gallery.mutations.trashAlbum);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Galleries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build image albums from the shared media library and publish them
            as standalone pages or shortcode embeds.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/gallery/categories">
            <Button variant="outline">Categories</Button>
          </Link>
          <Link to="/gallery/settings">
            <Button variant="outline">Settings</Button>
          </Link>
          <Link to="/gallery/new">
            <Button>Add Gallery</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ["All", counts?.all ?? 0],
          ["Drafts", counts?.draft ?? 0],
          ["Published", counts?.published ?? 0],
          ["Private", counts?.private ?? 0],
          ["Trash", counts?.trash ?? 0],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-border bg-card p-4"
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Album</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Images</th>
              <th className="px-4 py-3">Categories</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {albums.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                  No galleries yet.
                </td>
              </tr>
            ) : (
              albums.map((album: any) => (
                <tr key={album._id} className="border-t border-border/70">
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-foreground">{album.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      /gallery/{album.slug}
                    </div>
                    {album.excerpt && (
                      <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {album.excerpt}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top capitalize">
                    {album.status}
                  </td>
                  <td className="px-4 py-4 align-top text-muted-foreground">
                    {album.itemCount ?? album.items?.length ?? 0}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      {(album.categories ?? []).map((category: any) => (
                        <span
                          key={category._id}
                          className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                        >
                          {category.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-2">
                      <Link
                        to="/gallery/$albumId/edit"
                        params={{ albumId: album._id }}
                      >
                        <Button variant="outline" size="xs">
                          <PencilIcon className="mr-1 size-3" />
                          Edit
                        </Button>
                      </Link>
                      {album.status !== "trash" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            void trashAlbum({ albumId: album._id })
                              .then(() => toast.success("Gallery moved to trash."))
                              .catch((error) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to trash gallery",
                                ),
                              )
                          }
                        >
                          <Trash2Icon className="mr-1 size-3" />
                          Trash
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
