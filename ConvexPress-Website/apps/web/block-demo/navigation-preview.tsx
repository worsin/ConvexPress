import { useEffect, useMemo, useState } from "react";
import {
	createDemoContentPageHost,
	type InstalledDemoPageData,
} from "../src/templates/sdk/block-data/demo-channel";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import {
	prepareBlocks,
	type BlockInstance,
	type RendererRegistry,
} from "../src/templates/sdk/block-renderer/model";
import {
	navigationSpecimenTree,
	resolveNavigationDemo,
} from "./navigation-adapter";
const baseContext = {
	scope: { websiteKey: "block-demo", instanceKey: "isolated-demo" },
	documentKey: "synthetic-navigation-study",
	revision: "1",
	viewerKey: "synthetic-public-viewer",
};
const policy = {
	enabledPlugins: [],
	capabilities: ["tree.children", "reference.targetResolution", "viewer.authorization"],
	disabledBlocks: [],
};
export function NavigationDemo({
	instance,
	registry,
}: {
	instance: BlockInstance;
	registry: RendererRegistry;
}) {
	const host = useMemo(() => createDemoContentPageHost(), []);
	const [signedIn, setSignedIn] = useState(false);
	const context = {...baseContext, viewerKey: signedIn ? 'synthetic-signed-in-viewer' : 'synthetic-public-viewer'};
	const tree = navigationSpecimenTree(instance);
	const key = stableKey({tree, viewerKey:context.viewerKey});
	const [resolved, setResolved] = useState<{
		key: string;
		grant: InstalledDemoPageData;
	} | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	useEffect(() => {
		let active = true;
		host.invalidate();
		setFailure(null);
		void resolveNavigationDemo(tree, context.scope, policy, undefined, signedIn ? 'signed-in' : 'signed-out')
			.then((envelope) => {
				if (active)
					setResolved({
						key,
						grant: host.install({ tree, context, policy, envelope }),
					});
			})
			.catch((error) => {
				if (active)
					setFailure(
						error instanceof Error
							? error.message
							: "Navigation fixture refused",
					);
			});
		return () => {
			active = false;
			host.invalidate();
		};
	}, [host, key]);
	return (
		<div
			className="navigation-demo"
			data-demo-ready={resolved?.key === key ? "true" : "false"}
		>
			<p className="specimen-note">
				{instance.name === 'core/account-teaser' ? 'Synthetic account specimen · no authenticated session' : 'Synthetic navigation context · actual tree anchors and production renderer'}
			</p>
      {instance.name === 'core/account-teaser' && <button type="button" aria-pressed={signedIn} onClick={()=>setSignedIn(value=>!value)}>Use signed-in specimen</button>}
			{failure ? (
				<p role="status">{failure}</p>
			) : resolved?.key === key ? (
				prepareBlocks(
					tree,
					registry,
					policy,
					{ media: {} },
					{ grant: resolved.grant, current: context },
				)
			) : (
				<p role="status">Preparing the navigation study…</p>
			)}
		</div>
	);
}
