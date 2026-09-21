import type { TemplateManifest } from "../src/templates/sdk/types";
import { settingsCss } from "../src/templates/sdk/settingsModules";
export function demoTheme(manifest: TemplateManifest, presetId = "default") {
	const presets = manifest.presets?.colors ?? [];
	const explicit = presets.find((preset) => preset.id === presetId);
	const defaultColors = manifest.defaults?.colors ?? presets[0]?.colors ?? {};
	const values = {
		...manifest.defaults,
		colors: explicit?.colors ?? defaultColors,
	};
	return {
		...settingsCss(values),
		presetName:
			explicit?.name ??
			(manifest.defaults?.colors
				? "Pack defaults"
				: (presets[0]?.name ?? "SDK defaults")),
	};
}
