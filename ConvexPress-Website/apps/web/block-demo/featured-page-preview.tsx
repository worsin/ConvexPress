import { useEffect, useId, useMemo, useState } from "react";
import {
	createDemoContentPageHost,
	type InstalledDemoPageData,
	type DemoDataContext,
} from "../src/templates/sdk/block-data/demo-channel";
import {
	prepareBlocks,
	type BlockInstance,
	type RendererRegistry,
	type RenderPolicy,
} from "../src/templates/sdk/block-renderer/model";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { resolveFeaturedDemo } from "./featured-page-adapter";
import "./featured-page-preview.css";

export function FeaturedPageDemo({
	instance,
	registry,
	studioSrc,
}: {
	instance: BlockInstance;
	registry: RendererRegistry;
	studioSrc: string;
}) {
	const host = useMemo(() => createDemoContentPageHost(), []);
	const viewerId = useId();
	const [viewer, setViewer] = useState("demo-anonymous");
	const [refresh, setRefresh] = useState(0);
	const context: DemoDataContext = {
		scope: { websiteKey: "block-demo", instanceKey: "isolated-demo" },
		documentKey: "canonical-featured-study",
		revision: String(refresh),
		viewerKey: viewer,
	};
	const policy: RenderPolicy = {
		enabledPlugins: [],
		capabilities: ["reference.targetResolution"],
		disabledBlocks: [],
	};
	const tree = [instance];
	const key = stableKey({ tree, context, policy, studioSrc });
	const [snapshot, setSnapshot] = useState<{
		key: string;
		grant: InstalledDemoPageData;
	} | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	useEffect(() => {
		let active = true;
		host.invalidate();
		setFailure(null);
		void resolveFeaturedDemo(tree, context.scope, policy, studioSrc, viewer)
			.then((envelope) => {
				if (active)
					setSnapshot({
						key,
						grant: host.install({ tree, context, policy, envelope }),
					});
			})
			.catch((error) => {
				if (active)
					setFailure(
						error instanceof Error ? error.message : "Demo data refused",
					);
			});
		return () => {
			active = false;
			host.invalidate();
		};
		// key contains the exact tree, context and policy; source asset participates separately.
	}, [host, key, studioSrc]);
	const ready = snapshot?.key === key;
	return (
		<div
			className="featured-data-demo"
			data-demo-ready={ready ? "true" : "false"}
		>
			<p className="specimen-note">
				Synthetic content.page adapter · no live records or public transport
			</p>
			<div className="featured-demo-controls">
				<label htmlFor={viewerId}>Demo viewer</label>
				<select
					id={viewerId}
					value={viewer}
					onChange={(event) => setViewer(event.target.value)}
				>
					<option value="demo-anonymous">Public fixture</option>
					<option value="demo-other">Unavailable viewer fixture</option>
				</select>
				<button type="button" onClick={() => host.invalidate()}>
					Invalidate demo data
				</button>
				<button type="button" onClick={() => setRefresh((value) => value + 1)}>
					Resolve current view
				</button>
			</div>
			<div className="featured-demo-result">
				{failure ? (
					<p role="status">Demo data refused: {failure}</p>
				) : ready && snapshot ? (
					prepareBlocks(
						tree,
						registry,
						policy,
						{ media: {} },
						{ grant: snapshot.grant, current: context },
					)
				) : (
					<p role="status">Resolving synthetic page…</p>
				)}
			</div>
		</div>
	);
}
