import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	PromotionMediaConfirmationBody,
	type MediaDialog,
} from "./PromotionMediaConfirmation";
import { PromotionMediaFile } from "./PromotionMediaFile";
import { mediaFixture } from "./promotionMediaFixture";
import {
	canReviewExistingCopy,
	transferMode,
	type MediaState,
	type Recovery,
} from "./promotionMediaModel";
function render(
	dialog: MediaDialog,
	acknowledged = false,
	valid = true,
	reason = "",
) {
	return renderToStaticMarkup(
		<PromotionMediaConfirmationBody
			dialog={dialog}
			acknowledged={acknowledged}
			valid={valid}
			reason={reason}
			busy={false}
			onAcknowledge={() => {}}
			onReason={() => {}}
			onConfirm={() => {}}
			onCancel={() => {}}
		/>,
	);
}
test("file confirmation names the destination and one original, and its explicit action requires acknowledgement", () => {
	const f = mediaFixture(),
		dialog: MediaDialog = {
			kind: "file",
			confirmation: {
				review: f.review,
				scopeKey: JSON.stringify(f.scope),
				file: f.file,
				mode: "transfer",
			},
		};
	const html = render(dialog);
	expect(html).toContain("Production destination: https://example.test");
	expect(html).toContain("retreat.webp");
	expect(html).toContain("1,000");
	expect(html).toContain("image/webp");
	expect(html).toContain("Transfer this file to production");
	expect(html).toContain('disabled=""');
	expect(render(dialog, true)).not.toContain('disabled=""');
	expect(render(dialog, true, false)).toContain('disabled=""');
	expect(html).not.toContain(">Apply");
	expect(html).toContain("Cancel");
});
test("existing-copy recovery has a reason review followed by a separate disabled-until-acknowledged confirmation", () => {
	const f = mediaFixture(),
		base = {
			review: f.review,
			scopeKey: JSON.stringify(f.scope),
			file: f.file,
		};
	expect(render({ kind: "recovery-reason", ...base })).toContain('disabled=""');
	const reason = render(
		{ kind: "recovery-reason", ...base },
		false,
		true,
		"The original operator left this site.",
	);
	expect(reason).toContain("Prepare existing-copy review");
	expect(reason).not.toContain('disabled=""');
	expect(reason).not.toContain("Confirm existing-copy recovery");
	const recovery: Recovery = {
		recoveryId: "copy" as Recovery["recoveryId"],
		receiptId: f.review.receiptId,
		mediaKey: f.file.key,
		fingerprint: "c".repeat(64),
		status: "prepared",
		creatorId: "creator" as Recovery["creatorId"],
		beneficiaryId: "operator" as Recovery["beneficiaryId"],
		reason: "The original operator left this site.",
		expiresAt: 200,
		retryAfter: null,
		storageId: null,
		canConfirm: true,
	};
	const dialog: MediaDialog = { kind: "recovery", ...base, recovery };
	expect(render(dialog)).toContain('disabled=""');
	expect(render(dialog, true)).toContain(
		"Reviewed reason: The original operator left this site.",
	);
	expect(render(dialog, true)).not.toContain('disabled=""');
	expect(render(dialog, true, false)).toContain('disabled=""');
	expect(render(dialog, true)).toContain("Original creator");
	expect(render(dialog, true)).not.toContain(
		"Transfer this file to production",
	);
});
test("unknown-ID orphan renders its unresolved state with only an explicitly named original-result check", () => {
	const f = mediaFixture(),
		state: MediaState = {
			kind: "loaded",
			pending: false,
			value: {
				phase: "uncertain",
				transferKey: "c".repeat(64),
				dispatchCount: 1,
				storageId: null,
				failureCode: "MEDIA_UPLOAD_UNCERTAIN",
				possibleOrphan: true,
				retryAfter: null,
			},
		};
	const html = renderToStaticMarkup(
		<PromotionMediaFile
			file={f.file}
			state={state}
			pending={false}
			mode={transferMode(f.review, f.scope, true, f.file, state, 100)}
			canRecover={canReviewExistingCopy(
				f.review,
				f.scope,
				true,
				f.file,
				state,
				100,
			)}
			hasSavedRecovery={false}
			locked={false}
			onFile={() => {}}
			onRecovery={() => {}}
		/>,
	);
	expect(html).toContain("Upload outcome is unresolved");
	expect(html).toContain("manual reconciliation may be needed");
	expect(html).toContain('aria-label="Check original transfer: Retreat image"');
	expect(html).not.toContain("Review file transfer");
	expect(html).not.toContain("Review existing-copy recovery");
	expect(html).not.toContain("Retry upload");
	const dialog = render({
		kind: "file",
		confirmation: {
			review: f.review,
			scopeKey: JSON.stringify(f.scope),
			file: f.file,
			mode: "check",
		},
	});
	expect(dialog).toContain("Another upload stays blocked");
	expect(dialog).toContain('disabled=""');
});
test("verified stored copies and failed status reads never render another transfer", () => {
	const f = mediaFixture();
	for (const state of [
		{ kind: "error" },
		{
			kind: "loaded",
			pending: false,
			value: {
				phase: "verified",
				transferKey: "c".repeat(64),
				dispatchCount: 1,
				storageId: "copy",
				failureCode: null,
				possibleOrphan: false,
				retryAfter: null,
			},
		},
	] satisfies MediaState[]) {
		const html = renderToStaticMarkup(
			<PromotionMediaFile
				file={f.file}
				state={state}
				pending={false}
				mode={transferMode(f.review, f.scope, true, f.file, state, 100)}
				canRecover={canReviewExistingCopy(
					f.review,
					f.scope,
					true,
					f.file,
					state,
					100,
				)}
				hasSavedRecovery={false}
				locked={false}
				onFile={() => {}}
				onRecovery={() => {}}
			/>,
		);
		expect(html).not.toContain("Review file transfer");
		if (state.kind === "loaded") expect(html).not.toContain("<button");
		else expect(html).toContain("could not be opened");
	}
});
