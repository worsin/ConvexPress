import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro, Action } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/cta-band", ({ attrs, style }) => (
	<div className="journal-cta" data-block-style={style ?? "default"}>
		<P.Split ratio="two-one" gap="lg" align="center">
			<Intro {...attrs} />
			<P.Stack direction="horizontal" gap="sm" wrap>
				<Action label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} />
				<Action variant="outline" label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
			</P.Stack>
		</P.Split>
	</div>
));
