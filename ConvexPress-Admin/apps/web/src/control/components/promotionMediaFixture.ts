import { fixture } from "./promotionReviewFixture";
import { mediaFiles } from "./promotionMediaModel";
import type { ReviewScope } from "./promotionApplyModel";
export function mediaFixture() {
	const review = fixture();
	review.reviewFingerprint = "a".repeat(64);
	review.sourceIdentity.deploymentOrigin = "https://source.convex.cloud";
	review.targetIdentity.deploymentOrigin = "https://target.convex.cloud";
	review.authoredRecords = [
		{
			key: "media:image",
			kind: "media",
			sourceRevision: "v1",
			dataJson: JSON.stringify({
				title: "Retreat image",
				slug: "retreat",
				fileName: "retreat.webp",
				mimeType: "image/webp",
				mediaType: "image",
				fileSize: 1000,
				sha256: "b".repeat(64),
			}),
		},
	];
	review.issues = [
		{
			key: "media:image",
			path: "storageId",
			code: "TARGET_MEDIA_UPLOAD_REQUIRED",
			message: "File required",
		},
	];
	const scope: ReviewScope = {
		operatorId: "operator",
		websiteId: "website",
		websiteKey: review.sourceIdentity.websiteKey,
		sourceConnectionId: review.sourceConnectionId,
		targetConnectionId: review.targetConnectionId,
		sourceInstanceKey: review.sourceIdentity.instanceKey,
		targetInstanceKey: review.targetIdentity.instanceKey,
		sourceDeploymentOrigin: review.sourceIdentity.deploymentOrigin,
		targetDeploymentOrigin: review.targetIdentity.deploymentOrigin,
		sourceSiteOrigin: review.sourceIdentity.siteOrigin,
		targetSiteOrigin: review.targetIdentity.siteOrigin,
	};
	return { review, scope, file: mediaFiles(review).files[0] };
}
