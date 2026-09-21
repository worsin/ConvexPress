import { createElement } from "react";
import { usePrimitivePackId } from "../primitives";
import type {
	RendererDefinition,
	RendererRegistry,
	RenderInput,
} from "./model";

export interface BlockPackManifest {
	id: string;
	blocks?: { renderers?: Partial<Record<string, string>> };
}
/** Resolve only explicitly declared modules. No pack can borrow another pack's
 * renderer or change the Library's data contract, policy or prose behavior. */
export function installPackRenderers(
	library: RendererRegistry,
	manifests: readonly BlockPackManifest[],
	modules: Readonly<Record<string, RendererDefinition>>,
): RendererRegistry {
	const owned: Record<
		string,
		Record<string, RendererDefinition>
	> = Object.create(null);
	const used = new Set<string>();
	for (const manifest of manifests) {
		if (
			!/^[a-z][a-z0-9-]*$/.test(manifest.id) ||
			Object.hasOwn(owned, manifest.id)
		)
			throw Error("Invalid or duplicate renderer pack");
		const renderers: Record<string, RendererDefinition> = Object.create(null);
		for (const [name, source] of Object.entries(
			manifest.blocks?.renderers ?? {},
		)) {
			if (!Object.hasOwn(library, name) || source !== `./blocks/${name}.tsx`)
				throw Error(
					"Pack renderer must match a canonical block and its owned file",
				);
			const entries = Object.entries(modules).filter(([file]) =>
				file.endsWith(`/packs/${manifest.id}/blocks/${name}.tsx`),
			);
			if (entries.length !== 1)
				throw Error(
					`Missing or ambiguous pack renderer ${manifest.id}/${name}`,
				);
			const [file, definition] = entries[0];
			if (
				definition.blockName !== name ||
				definition.dataResolver !== library[name].dataResolver ||
				definition.flow !== library[name].flow
			)
				throw Error(
					"Pack renderer changed its canonical identity, data contract or flow",
				);
			renderers[name] = definition;
			used.add(file);
		}
		owned[manifest.id] = renderers;
	}
	for (const file of Object.keys(modules))
		if (!used.has(file)) throw Error(`Undeclared pack renderer ${file}`);
	return Object.freeze(
		Object.fromEntries(
			Object.entries(library).map(([name, baseline]) => [
				name,
				{
					...baseline,
					View: function InstalledPackBlock(props: RenderInput) {
						const pack = usePrimitivePackId();
						const definition = pack ? owned[pack]?.[name] : undefined;
						return definition ? (
							<div
								data-pack-block={`${pack}:${name}`}
								className={`cp-owned-block cp-owned-${pack}`}
							>
								{createElement(definition.View, props)}
							</div>
						) : (
							createElement(baseline.View, props)
						);
					},
				},
			]),
		),
	);
}
