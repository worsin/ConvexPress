import { useControlAccessChecks } from "../ControlAccessProvider";
import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useControlShell } from "../ControlShellContext";
import {
	CONTENT_KINDS,
	emptySelection,
	receiptStorageKey,
	selectionCount,
	toggleSelection,
	type Candidate,
	type ContentKind,
	type Review,
} from "./promotionReviewModel";
type CatalogCursor = { page: number; cursor: string | null };
import { PromotionSelect } from "./PromotionSelect";
import { PromotionMediaPanel } from "./PromotionMediaPanel";
import { PromotionReviewView } from "./PromotionReviewView";
import { PromotionApplyConfirmation } from "./PromotionApplyConfirmation";
import {
	availableApplyMode,
	confirmationIsCurrent,
	parsePendingReceipt,
	pendingReceiptResolved,
	matchesReviewScope,
	prepareApplyConfirmation,
	reviewScopeKey,
	submitReviewedConfirmation,
	type Confirmation,
	type ReviewScope,
} from "./promotionApplyModel";

type Environment = FunctionReturnType<
	typeof controlApi.websiteInstances.list
>[number];
type Connections = FunctionReturnType<
	typeof controlApi.connections.queries.listForWebsite
>;
type Props = {
	websiteId: string;
	websiteKey: string;
	organizationId: string;
	businessId: string;
	environments: Environment[];
	connections: Connections;
	/** Open the reviewed appearance flow for the current Customizer environment. */
	appearanceSourceInstanceId?: string;
};
type Check = FunctionArgs<
	typeof controlApi.rbac.queries.checkManyAccess
>["checks"][number];

class ReviewBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? (
			<p role="alert" className="rounded-lg border p-4">
				Content preview is unavailable. Reopen Sites after checking your
				controller connection.
			</p>
		) : (
			this.props.children
		);
	}
}
export function PromotionReviewPanel(props: Props) {
	const shell = useControlShell();
	return (
		<ReviewBoundary
			key={`${shell?.operator.id ?? "anonymous"}:${props.websiteId}:${props.appearanceSourceInstanceId ?? "content"}`}
		>
			<PromotionReviewPanelContent {...props} />
		</ReviewBoundary>
	);
}
function PromotionReviewPanelContent(props: Props) {
	const shell = useControlShell();
	const appearanceMode = !!props.appearanceSourceInstanceId;
	const initialSelection = () => ({ ...emptySelection(), ...(appearanceMode ? { includeAppearance: true } : {}) });
	const [open, setOpen] = useState(appearanceMode);
	const [sourceId, setSourceId] = useState("");
	const [targetId, setTargetId] = useState("");
	const options = props.environments.flatMap((environment) =>
		(
			props.connections.find((row) => row.instanceId === environment.instanceId)
				?.connections ?? []
		)
			.filter(
				(connection) =>
					connection.isActive &&
					connection.status === "connected" &&
					connection.hasCredentials,
			)
			.map((connection) => ({ environment, connection })),
	);
	const sources = options.filter((row) => row.environment.kind === "staging");
	const targets = options.filter((row) => row.environment.kind === "live");
	const source =
		sources.find((row) => row.connection.connectionId === sourceId) ??
		(sourceId === "" ? (props.appearanceSourceInstanceId
			? sources.find(row => row.environment.instanceId === props.appearanceSourceInstanceId)
			: sources.length === 1 ? sources[0] : undefined) : undefined);
	const target =
		targets.find((row) => row.connection.connectionId === targetId) ??
		(targetId === "" && targets.length === 1 ? targets[0] : undefined);
	const pairKey = `${source?.connection.connectionId ?? ""}/${target?.connection.connectionId ?? ""}`;
	const pairReady =
		!!source &&
		!!target &&
		source.environment.instanceId !== target.environment.instanceId &&
		source.environment.deploymentOrigin !==
			target.environment.deploymentOrigin &&
		source.environment.schemaVersion === target.environment.schemaVersion &&
		[source, target].every(
			(row) =>
				row.environment.provisioning === "ready" &&
				row.environment.compatibility === "compatible",
		);
	const checks: Check[] = [source, target].flatMap((row) =>
		row
			? [
					"site.read",
					"site.promote",
					"site.administer",
					...(row.environment.kind === "live"
						? ["environment.live.operate"]
						: []),
				].map((code) => ({
					selectorType: "capability" as const,
					code,
					organizationId: props.organizationId,
					businessId: props.businessId,
					websiteId: props.websiteId,
					instanceId: row.environment.instanceId,
				}))
			: [],
	);
	const decisions = useControlAccessChecks(open && pairReady ? { checks } : "skip",
	);
	const allowed =
		pairReady &&
		checks.length === 7 &&
		decisions?.length === 7 &&
		decisions.every((value) => value.allowed);
	const execute = useAction(controlApi.contentPromotion.apply.execute);
	const loadCatalog = useAction(controlApi.contentPromotion.catalog.list);
	const preview = useAction(controlApi.contentPromotion.review.preview);
	const control = useConvex();
	const [selection, setSelection] = useState(initialSelection);
	const [kind, setKind] = useState<ContentKind>("pageIds");
	const [catalog, setCatalog] = useState<
		Partial<
			Record<
				ContentKind,
				{ items: Candidate[]; more: boolean; next: CatalogCursor }
			>
		>
	>({});
	const [mediaBusy, setMediaBusy] = useState(false);
	const mediaBusyRef = useRef(false);
	function onMediaBusyChange(value: boolean) {
		mediaBusyRef.current = value;
		setMediaBusy(value);
	}
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [review, setReview] = useState<Review | null>(null);
	const [savedId, setSavedId] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());
	const generation = useRef(0);
	const pending = useRef(false);
	const request = useRef<{ signature: string; key: string } | null>(null);
	const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
	const [acknowledged, setAcknowledged] = useState(false);
	const [pendingReceipt, setPendingReceipt] = useState<{
		receiptId: string;
		reviewFingerprint: string;
	} | null>(null);
	const scope: ReviewScope = {
		operatorId: shell?.operator.id ?? "",
		websiteId: props.websiteId,
		websiteKey: props.websiteKey,
		sourceConnectionId: source?.connection.connectionId ?? "",
		targetConnectionId: target?.connection.connectionId ?? "",
		sourceInstanceKey: source?.environment.instanceKey ?? "",
		targetInstanceKey: target?.environment.instanceKey ?? "",
		sourceDeploymentOrigin: source?.environment.deploymentOrigin ?? "",
		targetDeploymentOrigin: target?.environment.deploymentOrigin ?? "",
		sourceSiteOrigin: source?.environment.siteOrigin ?? "",
		targetSiteOrigin: target?.environment.siteOrigin ?? "",
	};
	const scopeKey = reviewScopeKey(scope);
	const current = useRef({ scope, allowed: !!allowed, scopeKey });
	current.current = { scope, allowed: !!allowed, scopeKey };
	const storageKey = receiptStorageKey(
		shell?.operator.id ?? "anonymous",
		props.websiteId,
	);
	useEffect(() => {
		generation.current++;
		setSelection({ ...emptySelection(), ...(appearanceMode ? { includeAppearance: true } : {}) });
		setCatalog({});
		setReview(null);
		setError(null);
		request.current = null;
		setConfirmation(null);
		setAcknowledged(false);
	}, [scopeKey, appearanceMode]);
	useEffect(() => {
		try {
			setSavedId(localStorage.getItem(storageKey));
			setPendingReceipt(
				parsePendingReceipt(localStorage.getItem(`${storageKey}:pending`)),
			);
		} catch {
			setSavedId(null);
		}
	}, [storageKey]);
	useEffect(() => {
		if (!allowed || !open) {
			generation.current++;
			setConfirmation(null);
			setAcknowledged(false);
			setReview(null);
			setCatalog({});
		}
	}, [allowed, open]);
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	useEffect(() => {
		if (!review) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [review]);
	function saveReceipt(value: Review, authoritative = true) {
		setPendingReceipt((previous) =>
			pendingReceiptResolved(previous, value, authoritative) ? null : previous,
		);
		try {
			const marker = parsePendingReceipt(
				localStorage.getItem(`${storageKey}:pending`),
			);
			if (pendingReceiptResolved(marker, value, authoritative))
				localStorage.removeItem(`${storageKey}:pending`);
		} catch {
			/* Durable state remains available for recovery. */
		}
		setReview(value);
		setSavedId(value.receiptId);
		setNow(Date.now());
		try {
			localStorage.setItem(storageKey, value.receiptId);
		} catch {
			/* Receipt remains durable on the controller. */
		}
	}
	async function run(
		work: (version: number) => Promise<void>,
		failure: string,
	) {
		if (pending.current || mediaBusyRef.current || !allowed) return;
		pending.current = true;
		setBusy(true);
		setError(null);
		const version = generation.current;
		try {
			await work(version);
		} catch {
			if (
				version === generation.current &&
				current.current.allowed &&
				current.current.scopeKey === scopeKey
			) {
				setError(failure);
				setConfirmation(null);
				setAcknowledged(false);
				setReview(null);
			}
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}
	function load(more = false) {
		void run(async (version) => {
			if (!source || !target) return;
			const position = more ? (catalog[kind]?.next ?? {page: 1, cursor: null}) : {page: 1, cursor: null};
			const data = await loadCatalog({
				sourceConnectionId: source.connection.connectionId,
				targetConnectionId: target.connection.connectionId,
				kind, ...position,
			});
			if (
				version === generation.current &&
				current.current.allowed &&
				current.current.scopeKey === scopeKey
			)
				setCatalog((current) => ({
					...current,
					[kind]: {
						...data,
						items: more
							? [
									...new Map(
										[...(current[kind]?.items ?? []), ...data.items].map(
											(item) => [item.id, item],
										),
									).values(),
								]
							: data.items,
					},
				}));
		}, "Content could not be loaded. Check your connection, permissions, and that this content plugin is enabled.");
	}
	function createReview() {
		void run(async (version) => {
			if (!source || !target) return;
			const signature = JSON.stringify({ pairKey, selection });
			if (request.current?.signature !== signature)
				request.current = { signature, key: crypto.randomUUID() };
			const result = await preview({
				sourceConnectionId: source.connection.connectionId,
				targetConnectionId: target.connection.connectionId,
				requestKey: request.current.key,
				selection,
				mediaBindings: [],
				dependencyBindings: [],
			});
			if (
				version === generation.current &&
				current.current.allowed &&
				current.current.scopeKey === scopeKey
			)
				saveReceipt(result);
		}, "The review could not be completed. Check environment readiness, content compatibility, and your permissions. Retry uses the same request to avoid duplicate reviews.");
	}
	async function readReceipt(receiptId: string) {
		const result = await control.query(
			controlApi.contentPromotion.records.get,
			{ receiptId: receiptId as Id<"overseer_contentPromotionReviews"> },
		);
		if (
			!matchesReviewScope(result, current.current.scope) ||
			!current.current.allowed
		)
			throw new Error("Review scope changed");
		return result;
	}
	function refresh() {
		void run(async (version) => {
			const id = review?.receiptId ?? pendingReceipt?.receiptId ?? savedId;
			if (!id) return;
			const result = await readReceipt(id);
			if (
				version === generation.current &&
				current.current.allowed &&
				current.current.scopeKey === scopeKey
			) {
				saveReceipt(result);
				setSelection({ ...emptySelection(), ...(appearanceMode ? { includeAppearance: true } : {}) });
				setConfirmation(null);
				setAcknowledged(false);
			}
		}, "This receipt could not be opened for the selected environments. It may belong to another pair, or your access has changed.");
	}
	const unknownOutcome =
		!!review &&
		!review.applyState &&
		pendingReceipt?.receiptId === review.receiptId &&
		pendingReceipt.reviewFingerprint === review.reviewFingerprint;
	const mode = review
		? availableApplyMode(review, scope, !!allowed, now)
		: null;
	const confirmationValid =
		!!confirmation &&
		!!review &&
		confirmationIsCurrent(confirmation, review, scope, !!allowed, now);
	function beginConfirmation() {
		void run(async (version) => {
			if (!review) return;
			const fresh = await readReceipt(review.receiptId);
			if (version !== generation.current) return;
			saveReceipt(fresh);
			const next = prepareApplyConfirmation(
				fresh,
				current.current.scope,
				current.current.allowed,
			);
			if (!next) {
				setConfirmation(null);
				setAcknowledged(false);
				setError(
					"This receipt is no longer eligible for a new confirmation. Its current result is shown below.",
				);
				return;
			}
			setAcknowledged(false);
			setConfirmation(next);
		}, "This review is no longer eligible. Refresh the result or create a new preview and review it again.");
	}
	function confirmApply() {
		void run(async (version) => {
			if (!confirmation || !acknowledged) return;
			const confirmed = confirmation;
			const result = await submitReviewedConfirmation(confirmed, acknowledged, {
				context: () => ({
					scope: current.current.scope,
					allowed: current.current.allowed,
					current:
						version === generation.current &&
						current.current.scopeKey === confirmed.scopeKey,
					now: Date.now(),
				}),
				read: readReceipt,
				execute,
				dispatched: () => {
					const marker = {
						receiptId: confirmed.review.receiptId,
						reviewFingerprint: confirmed.review.reviewFingerprint,
					};
					// Only receipt metadata is persisted; authored data and credentials stay out of local storage.
					localStorage.setItem(`${storageKey}:pending`, JSON.stringify(marker));
					setPendingReceipt(marker);
				},
			});
			if (version !== generation.current) return;
			saveReceipt(result.review, !result.refreshFailed);
			setConfirmation(null);
			setAcknowledged(false);
			if (result.refreshFailed)
				setError(
					"The latest receipt could not be refreshed. Refresh the result before deciding whether recovery is needed.",
				);
		}, "The confirmation could not be completed. Refresh the receipt to check its durable result before reviewing any retry.");
	}
	const locked = busy || mediaBusy;
	function changeSelection(next: typeof selection) {
		setSelection(next);
		setReview(null);
		setConfirmation(null);
		setAcknowledged(false);
		setError(null);
	}
	return (
		<section
			aria-label={appearanceMode ? "Appearance promotion" : "Content promotion"}
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-base font-semibold">{appearanceMode ? "Appearance promotion" : "Content promotion"}</h2>
					<p className="text-sm text-ink-2">
						{appearanceMode ? "Review published staging appearance and its media before applying it to live. Unsaved Customizer edits are not included." : "Review staging content before moving it to production. Users, orders, and other activity stay in their own environment."}
					</p>
				</div>
				<Button
					variant="outline"
					onClick={() => setOpen((value) => !value)}
					aria-expanded={open}
				>
					{open ? "Close preview" : "Preview staging content"}
				</Button>
			</div>
			{open && (
				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						{[
							{
								label: "Source staging environment",
								rows: sources,
								selected: source?.connection.connectionId ?? "",
								onChange: setSourceId,
							},
							{
								label: "Target production environment",
								rows: targets,
								selected: target?.connection.connectionId ?? "",
								onChange: setTargetId,
							},
						].map((field) => (
							<PromotionSelect
								key={field.label}
								label={field.label}
								className="block w-full rounded border border-border bg-background p-2"
								disabled={locked}
								value={field.selected}
								onChange={(event) => field.onChange(event.target.value)}
							>
								<option value="">Choose environment</option>
								{field.rows.map((row) => (
									<option
										key={row.connection.connectionId}
										value={row.connection.connectionId}
									>
										{row.environment.label ?? row.environment.instanceKey} ·{" "}
										{row.connection.name}
									</option>
								))}
							</PromotionSelect>
						))}
					</div>
					{!pairReady ? (
						<p role="status" className="text-sm">
							Connect distinct staging and production environments with matching
							schemas. Both must be compatible and ready before previewing
							content.
						</p>
					) : !decisions ? (
						<p role="status">Checking access…</p>
					) : !allowed ? (
						<p role="status">
							You need content promotion and administration access to both
							environments, including permission to operate production.
						</p>
					) : (
						<>
							<p className="text-sm text-ink-2">
								Choose up to 100 authored items. Related content is included
								automatically. Ready reviews can be explicitly confirmed for
								production. Supported media files can be transferred with
								separate confirmation. Content Apply remains a separate reviewed
								action.
							</p>
							<div className="flex flex-wrap items-end gap-3">
								<PromotionSelect
									label="Content type"
									value={kind}
									disabled={locked}
									onChange={(event) =>
										setKind(event.target.value as ContentKind)
									}
									className="mt-1 block rounded border border-border bg-background p-2"
								>
									{Object.entries(CONTENT_KINDS).map(([key, label]) => (
										<option key={key} value={key}>
											{label}
										</option>
									))}
								</PromotionSelect>
								<Button
									variant="outline"
									disabled={locked}
									onClick={() => load()}
								>
									Load content
								</Button>
							</div>
							{catalog[kind] && (
								<fieldset
									disabled={locked || !!pendingReceipt}
									className="max-h-72 space-y-2 overflow-auto rounded border border-border p-3"
								>
									<legend className="px-1 text-sm">
										{CONTENT_KINDS[kind]}
									</legend>
									{catalog[kind]?.items.length === 0 && (
										<p className="text-sm">
											No selectable content on this page.
										</p>
									)}
									{catalog[kind]?.items.map((item) => (
										<label
											key={item.id}
											className="flex items-start gap-2 text-sm"
										>
											<input
												type="checkbox"
												className="mt-1"
												checked={(selection[kind] ?? []).includes(item.id)}
												onChange={() => {
													try {
														changeSelection(
															toggleSelection(selection, kind, item.id),
														);
													} catch {
														setError("Choose at most 100 items per review.");
													}
												}}
											/>
											<span>
												{item.title}
												<small className="block text-muted-foreground">
													{item.detail}
												</small>
											</span>
										</label>
									))}
								</fieldset>
							)}
							{catalog[kind]?.more && (
								<Button
									variant="outline"
									disabled={locked}
									onClick={() => load(true)}
								>
									Load more
								</Button>
							)}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={locked || !!pendingReceipt || selection.includePresentation}
                  checked={!!selection.includeAppearance || selection.includePresentation}
                  onChange={event => changeSelection({ ...selection, includeAppearance: event.target.checked || undefined })} />
                Include template appearance
              </label>
              {selection.includeAppearance && !selection.includePresentation && <p className="text-sm text-ink-2">Includes the active template, settings, variants and referenced media. General site settings and homepage presentation are preserved.</p>}
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									disabled={locked || !!pendingReceipt}
									checked={selection.includePresentation}
									onChange={(event) =>
										changeSelection({
											...selection,
											includePresentation: event.target.checked,
										})
									}
								/>
								Include template settings and homepage presentation
							</label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={locked || !!pendingReceipt}
                  checked={!!selection.includeRoutePolicies}
                  onChange={event => changeSelection({...selection, includeRoutePolicies: event.target.checked || undefined})} />
                Include site access rules
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={locked || !!pendingReceipt}
                  checked={!!selection.includeLocalization}
                  onChange={event => changeSelection({...selection, includeLocalization: event.target.checked || undefined, localeGroupKeys: event.target.checked ? selection.localeGroupKeys : undefined})} />
                Include site languages and selected translation groups
              </label>
              {selection.includeLocalization && <div className="space-y-2 text-sm">
                <p className="text-ink-2">Review all language settings and landing pages, plus complete translation groups for included pages and posts. This can change language links across the website. Other target groups are preserved and checked for conflicts.</p>
                <label className="block">Additional translation group keys
                  <input className="mt-1 block w-full rounded border bg-transparent p-2" disabled={locked || !!pendingReceipt}
                    placeholder="For example: guide, support"
                    defaultValue={(selection.localeGroupKeys ?? []).join(", ")}
                    onBlur={event => changeSelection({...selection, localeGroupKeys:event.target.value.split(",").map(value=>value.trim()).filter(Boolean)})} />
                </label>
                <p className="text-ink-2">Optional: include named groups that no longer contain pages, so their removed translations can be reviewed too.</p>
              </div>}
              {selection.includeRoutePolicies && <p className="text-sm text-ink-2">Review all source URL access rules and their membership plans. These rules can affect pages beyond your selection.</p>}
							<p className="text-sm">
								{selectionCount(selection)} selected items
								{selection.includePresentation ? " plus presentation" : selection.includeAppearance ? " plus appearance" : ""}
                {selection.includeRoutePolicies ? " plus site access rules" : ""}
                {selection.includeLocalization ? " plus site languages" : ""}
							</p>
							<div className="flex flex-wrap gap-2">
								<Button
									disabled={
										locked ||
										!!pendingReceipt ||
										(selectionCount(selection) === 0 &&
											!selection.includePresentation && !selection.includeAppearance && !selection.includeRoutePolicies && !selection.includeLocalization)
									}
									onClick={createReview}
								>
									{busy ? "Working…" : "Create preview"}
								</Button>
								{(savedId || pendingReceipt) && (
									<Button variant="outline" disabled={locked} onClick={refresh}>
										Open saved review
									</Button>
								)}
								<Button
									variant="ghost"
									disabled={locked || !!pendingReceipt}
									onClick={() => {
										request.current = null;
										changeSelection(initialSelection());
									}}
								>
									Start new review
								</Button>
							</div>
						</>
					)}
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
					{pendingReceipt && allowed && (
						<p role="status" className="text-sm">
							A submitted receipt needs its outcome checked. Open the saved
							review and refresh its result before starting another change.
						</p>
					)}
					{review && allowed && (
						<>
							<PromotionReviewView
								review={review}
								now={now}
								unknownOutcome={unknownOutcome}
							/>
							<div className="flex flex-wrap gap-2">
								<Button variant="outline" disabled={locked} onClick={refresh}>
									Refresh result
								</Button>
								{mode && (
									<Button disabled={locked} onClick={beginConfirmation}>
										{mode === "recover"
											? "Review recovery"
											: unknownOutcome
												? "Review safe retry"
												: "Review production apply"}
									</Button>
								)}
							</div>
						</>
					)}
					{review && allowed && !unknownOutcome && !review.applyState && (
						<PromotionMediaPanel
							key={`${scopeKey}/${review.receiptId}/${review.reviewFingerprint}`}
							review={review}
							scope={scope}
							allowed={!!allowed && open}
							parentBusy={busy || !!confirmation || !!pendingReceipt}
							now={now}
							onBusyChange={onMediaBusyChange}
							onReview={(value) => {
								if (
									current.current.allowed &&
									matchesReviewScope(value, current.current.scope)
								) {
									saveReceipt(value);
									setSelection({ ...emptySelection(), ...(appearanceMode ? { includeAppearance: true } : {}) });
									request.current = null;
									setConfirmation(null);
									setAcknowledged(false);
								}
							}}
						/>
					)}
					{confirmation &&
						allowed &&
						open &&
						current.current.scopeKey === confirmation.scopeKey && (
							<PromotionApplyConfirmation
								confirmation={confirmation}
								acknowledged={acknowledged}
								onAcknowledge={setAcknowledged}
								busy={busy}
								valid={confirmationValid}
								unknownOutcome={unknownOutcome}
								now={now}
								onConfirm={confirmApply}
								onCancel={() => {
									setConfirmation(null);
									setAcknowledged(false);
								}}
							/>
						)}
				</div>
			)}
		</section>
	);
}
