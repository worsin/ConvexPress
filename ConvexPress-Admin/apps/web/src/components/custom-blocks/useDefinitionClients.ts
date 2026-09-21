import { useEffect, useMemo, useRef } from "react";
import { useConvex } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { DefinitionCreationClient } from "./create-model";
import type { DefinitionClient } from "./model";

export interface DefinitionClients {
	creation: DefinitionCreationClient;
	workbench: DefinitionClient;
}

/** Each caller is mounted inside a verified site/session boundary. */
export function useDefinitionClients(enabled: boolean): DefinitionClients {
	const convex = useConvex();
	const current = useRef({ active: true, enabled });
	current.current.enabled = enabled;
	useEffect(() => {
		current.current.active = true;
		return () => {
			current.current.active = false;
		};
	}, []);
	return useMemo(() => {
		async function run<T>(operation: () => Promise<T>): Promise<T> {
			if (!current.current.active || !current.current.enabled)
				throw Error("Custom block access changed.");
			const value = await operation();
			if (!current.current.active || !current.current.enabled)
				throw Error("Custom block access changed.");
			return value;
		}
		return {
			creation: {
				compose: (args) =>
					run(() => convex.action(api.blockDefinitions.ai.compose, args)),
				create: (args) =>
					run(() => convex.mutation(api.blockDefinitions.drafts.create, args)),
				accept: (args) =>
					run(() =>
						convex.mutation(
							api.blockDefinitions.composeContext.createDraft,
							args,
						),
					),
				get: (args) =>
					run(() => convex.query(api.blockDefinitions.drafts.get, args)),
				options: (args) =>
					run(() =>
						convex.query(api.blockDefinitions.composeResources.options, args),
					),
			},
			workbench: {
				promotion: {
					exportPackage: (args) =>
						run(() =>
							convex.query(api.blockDefinitions.promotion.exportPackage, args),
						),
					inspect: (args) =>
						run(() =>
							convex.query(api.blockDefinitions.promotion.inspect, args),
						),
					confirm: (args) =>
						run(() =>
							convex.mutation(api.blockDefinitions.promotion.confirm, args),
						),
				},
				styleForPack: (args) =>
					run(() => convex.action(api.blockDefinitions.ai.styleForPack, args)),
				get: (args) =>
					run(() => convex.query(api.blockDefinitions.drafts.get, args)),
				history: (args) =>
					run(() => convex.query(api.blockDefinitions.drafts.history, args)),
				save: (args) =>
					run(() => convex.mutation(api.blockDefinitions.drafts.save, args)),
				restore: (args) =>
					run(() => convex.mutation(api.blockDefinitions.drafts.restore, args)),
				review: (args) =>
					run(() =>
						convex.mutation(
							api.blockDefinitions.publication.setVersionState,
							args,
						),
					),
			},
		};
	}, [convex]);
}
