/**
 * Reviews loader: reviews gate, the getMyReviews query and the update /
 * remove mutations (validation + toasts), handed to the `dashboard.reviews`
 * surface.
 */
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import CoreDashboardReviews, {
  type DashboardReview,
  type DashboardReviewUpdate,
  type DashboardReviewsSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.reviews";
import { Surface } from "@/templates/sdk/Surface";
import { idFromString } from "@/lib/ids";

export function DashboardReviewsPage() {
  const settings = useSettings();
  const reviewsEnabled = settings?.plugins?.commerceReviewsEnabled === true;
  const reviews: DashboardReview[] | null | undefined = useQuery(
    api.commerceReviews.queries.getMyReviews,
    reviewsEnabled ? {} : "skip",
  );

  const updateMutation = useMutation(
    api.commerceReviews.mutations.update,
  );
  const removeMutation = useMutation(
    api.commerceReviews.mutations.remove,
  );

  async function update(reviewId: string, input: DashboardReviewUpdate): Promise<boolean> {
    if (input.rating === 0) {
      toast.error("Please select a rating");
      return false;
    }
    try {
      await updateMutation({
        reviewId: idFromString<"commerce_review_items">(reviewId),
        rating: input.rating,
        title: input.title,
        content: input.content,
      });
      toast.success(
        "Review updated. Changes may require re-moderation.",
      );
      return true;
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update review",
      );
      return false;
    }
  }

  async function remove(reviewId: string): Promise<boolean> {
    try {
      await removeMutation({ reviewId: idFromString<"commerce_review_items">(reviewId) });
      toast.success("Review deleted");
      return true;
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete review",
      );
      return false;
    }
  }

  const data: DashboardReviewsSurfaceData = {
    // null: the backend reports none available; the surface reads undefined as loading.
    reviews: reviews === null ? [] : reviews,
    actions: { update, remove },
  };

  return (
    <PublicPluginGate pluginId="commerceReviews">
      <Surface name="dashboard.reviews" data={data} fallback={CoreDashboardReviews} />
    </PublicPluginGate>
  );
}
