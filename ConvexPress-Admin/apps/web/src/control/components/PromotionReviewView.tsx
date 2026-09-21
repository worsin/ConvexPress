import { PromotionAuthoredContent } from "./PromotionAuthoredContent";
import {
	parseReviewedRecord,
	receiptStatus,
	type Review,
} from "./promotionReviewModel";
const OUTCOMES = {
	checking: [
		"Checking reviewed content",
		"The controller is checking the original review before a production write.",
	],
	submitting: [
		"Applying reviewed content",
		"The production request has been recorded. Refresh the result to check its outcome.",
	],
	uncertain: [
		"Apply outcome is uncertain",
		"The previous request may have completed. Use recovery for this same receipt; do not start a replacement apply.",
	],
	applied: [
		"Applied to production",
		"The controller confirmed this reviewed change on production.",
	],
	rejected: [
		"Apply was rejected",
		"This apply did not proceed. Resolve the reported conflict and create a fresh preview.",
	],
	"rolled-back": [
		"Target reports a rollback",
		"Production reports that this receipt was rolled back. Create a fresh preview before another change.",
	],
} as const;
export function PromotionReviewView({
	review,
	now = Date.now(),
	unknownOutcome = false,
	expanded = false,
}: {
	review: Review;
	now?: number;
	unknownOutcome?: boolean;
	expanded?: boolean;
}) {
	const status = receiptStatus(review, now);
  const planLabels = Object.fromEntries(review.authoredRecords.flatMap(incoming => {
    const record = parseReviewedRecord(incoming);
    return record?.kind === "plan" && typeof record.data.title === "string" ? [[`@promotion:${record.key}`, record.data.title]] : [];
  }));
	const outcome = review.applyState;
	const heading = unknownOutcome
		? "Apply outcome is unconfirmed"
		: outcome
			? OUTCOMES[outcome.status][0]
			: status === "reviewed"
				? review.canApply
					? "Ready for production confirmation"
					: "Review recorded"
				: `Review ${status}`;
	return (
		<section
			aria-label="Content promotion review"
			className="space-y-4 rounded-lg border border-border p-4"
		>
			<div>
				<h3 className="font-semibold" aria-live="polite">
					{heading}
				</h3>
				<p className="text-sm text-ink-2">
					{review.sourceIdentity.instanceKey} →{" "}
					{review.targetIdentity.instanceKey}
				</p>
				<p className="break-all text-xs text-muted-foreground">
					{review.sourceIdentity.websiteKey} ·{" "}
					{review.sourceIdentity.deploymentOrigin} →{" "}
					{review.targetIdentity.deploymentOrigin}
				</p>
				<p className="text-sm text-ink-2">
					{unknownOutcome
						? "A request was sent, but its durable outcome has not been read. Refresh this receipt before deciding whether to retry it."
						: outcome
							? OUTCOMES[outcome.status][1]
							: review.canApply
								? "Review the incoming values before confirming a production change."
								: "This receipt cannot start a production apply."}
				</p>
				<p className="text-xs text-muted-foreground">
					Review expires {new Date(review.expiresAt).toLocaleString()} ·{" "}
					{review.recordCount} authored records
				</p>
			</div>
			{outcome && (
				<div className="space-y-1 text-sm" role="status">
					{outcome.finishedAt && (
						<p>
							Outcome recorded {new Date(outcome.finishedAt).toLocaleString()}.
						</p>
					)}
					{outcome.dispatchCount === 0 && (
						<p>
							No production dispatch has been recorded for this receipt.
							{review.expiresAt <= now && !review.canRecover
								? " This review has expired; create a fresh preview before another attempt."
								: ""}
						</p>
					)}
					{outcome.sourceCheckedAt && (
						<p className="text-xs text-muted-foreground">
							Source checked{" "}
							{new Date(outcome.sourceCheckedAt).toLocaleString()}.
						</p>
					)}
					{outcome.retryAfter && outcome.retryAfter > now && (
						<p>
							Another attempt is still active. Refresh after{" "}
							{new Date(outcome.retryAfter).toLocaleTimeString()} if it has not
							completed.
						</p>
					)}
					{outcome.failureCode && (
						<p>
							Reason:{" "}
							{outcome.failureCode === "PROMOTION_CONFLICT"
								? "Production content or dependencies changed after review."
								: outcome.failureCode === "SOURCE_CHANGED"
									? "Staging content changed after review."
									: outcome.failureCode.replaceAll("_", " ").toLowerCase()}
							.
						</p>
					)}
					{outcome.status === "applied" && (
						<p>
							{outcome.mappings === null
								? "Applied status was confirmed; this response does not include target item IDs."
								: `${outcome.mappings.length} target items are recorded in the receipt.`}
						</p>
					)}
				</div>
			)}
			{status === "expired" && !outcome && !unknownOutcome && (
				<p role="status">
					This review has expired. Create a new preview to check current
					content.
				</p>
			)}
			{review.failureCode && (
				<p role="alert">
          {review.failureCode === "ROUTE_POLICY_SELECTION_REQUIRED"
            ? "This staging site has URL access rules. Select “Include site access rules” and create a new preview to review those rules and their membership plans before promotion."
            : <>The review could not finish ({review.failureCode}). Check the environment connections and content compatibility before starting another review.</>}
				</p>
			)}
			{review.mediaRequired > review.mediaProvided && (
				<p role="status">
					{review.mediaRequired - review.mediaProvided} media files need
					verified copies in production. Resolve the listed file prerequisites
					before applying.
				</p>
			)}
			{review.issues.length > 0 && (
				<div>
					<h4 className="font-medium">Items to resolve</h4>
					<ul className="list-disc space-y-2 pl-5">
						{review.issues.map((issue, index) => (
							<li key={`${issue.key}:${index}`} className="text-sm">
								<p>{issue.message}</p>
								<small className="text-muted-foreground">
									{issue.key} · {issue.path} · {issue.code}
								</small>
							</li>
						))}
					</ul>
				</div>
			)}
			<div className="space-y-2">
				<h4 className="font-medium">
					{outcome?.status === "applied"
						? "Reviewed content"
						: "Incoming content"}
				</h4>
				{review.authoredRecords.length === 0 && (
					<p className="text-sm text-ink-2">
						No incoming content was recorded.
					</p>
				)}
				{review.authoredRecords.map((incoming) => {
					const record = parseReviewedRecord(incoming);
					if (!record)
						return (
							<p
								key={incoming.key}
								role="alert"
								className="text-sm text-destructive"
							>
								Incoming content could not be validated. Refresh this review
								after updating the controller.
							</p>
						);
					const change = review.changes.find((item) => item.key === record.key);
					const title = record.kind === "restriction" && record.data.resourceType === "route"
            ? `Site access: ${String(record.data.resourceIdOrKey)}`
            : "title" in record.data
							? record.data.title
							: "name" in record.data
								? record.data.name
								: record.key;
					const label = (
						<>
							{typeof title === "string" ? title : record.key}{" "}
							<span className="font-normal text-muted-foreground">
								· {record.kind} ·{" "}
								{change
									? change.targetId
										? "Update"
										: "Create"
									: "Unresolved"}
							</span>
						</>
					);
					const body = (
						<>
							{change && (
								<p className="mt-2 text-xs text-ink-2">
									{change.fields.length} authored fields reviewed ·{" "}
									{change.targetId
										? "Updates an existing item"
										: "Creates a new item"}
								</p>
							)}
							<PromotionAuthoredContent data={record.data} planLabels={planLabels} />
							<details className="mt-3 text-xs text-muted-foreground">
								<summary className="cursor-pointer">Raw authored data</summary>
								{change && (
									<p className="mt-2">
										Reviewed fields: {change.fields.join(", ") || "None"}
									</p>
								)}
								<pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
									{JSON.stringify(record.data, null, 2)}
								</pre>
							</details>
						</>
					);
					return expanded ? (
						<section
							key={record.key}
							className="rounded border border-border p-3"
						>
							<h5 className="text-sm font-medium">{label}</h5>
							{body}
						</section>
					) : (
						<details
							key={record.key}
							className="rounded border border-border p-3"
						>
							<summary className="cursor-pointer text-sm font-medium">
								{label}
							</summary>
							{body}
						</details>
					);
				})}
			</div>
			<details className="text-xs text-muted-foreground">
				<summary className="cursor-pointer">Review receipt</summary>
				<dl className="mt-2 space-y-1 break-all">
					<dt>Receipt</dt>
					<dd>{review.receiptId}</dd>
					<dt>Review fingerprint</dt>
					<dd>{review.reviewFingerprint}</dd>
					<dt>Manifest fingerprint</dt>
					<dd>{review.manifestHash ?? "Not recorded"}</dd>
					<dt>Request fingerprint</dt>
					<dd>{review.requestHash}</dd>
					<dt>Apply eligibility</dt>
					<dd>
						{review.canApply
							? "Eligible for explicit production confirmation"
							: "A new apply is unavailable"}
					</dd>
					{outcome && (
						<>
							<dt>Apply record</dt>
							<dd>{outcome.applyId}</dd>
							<dt>Dispatches</dt>
							<dd>{outcome.dispatchCount}</dd>
							{outcome.mappings && (
								<>
									<dt>Confirmed target items</dt>
									<dd>
										<ul>
											{outcome.mappings.map((mapping) => (
												<li key={mapping.key}>
													{mapping.kind}: {mapping.key} → {mapping.targetId}
												</li>
											))}
										</ul>
									</dd>
								</>
							)}
						</>
					)}
				</dl>
			</details>
		</section>
	);
}
